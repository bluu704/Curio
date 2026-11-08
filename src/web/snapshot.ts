/**
 * The library snapshot shared with the desktop app (crates/core/src/sync.rs): every synced table,
 * row by row, with the desktop database's column names. The web version keeps its data in the
 * in-browser engine's shape and converts both ways here; the merge is the same three-way merge.
 */
import type { Archive, Category, FieldDef, FileRef, Item, StatusDef, Tag, View } from "@/api/types";
import type { DB } from "@/api/adapters/mock";
import { DEFAULT_CARD, DEFAULT_COLUMNS } from "@/lib/defaults";

export type Row = Record<string, unknown>;
export interface Snapshot { format: number; tables: Record<string, Record<string, Row>> }

/** Same order as the desktop (parents before children). */
export const TABLES = ["archives", "statuses", "field_defs", "views", "tags", "categories", "items", "files", "item_tags", "item_categories", "settings"] as const;
const PK: Record<string, string[]> = { item_tags: ["item_id", "tag_id"], item_categories: ["item_id", "category_id"], settings: ["key"] };
const pkOf = (t: string) => PK[t] ?? ["id"];
const keyOf = (t: string, row: Row) => pkOf(t).map((k) => (typeof row[k] === "string" ? row[k] : JSON.stringify(row[k]))).join("\u001f");
/** Columns holding JSON text. */
const JSON_COLS: Record<string, string[]> = { items: ["props", "blocks", "source"], field_defs: ["options"], views: ["config"], settings: ["value"] };
/** Files uploaded in this browser and not shared (too big for the size limit, or before their first sync). */
export const isBrowserFile = (f: FileRef) => f.uri.startsWith("(업로드)");
/** Shared uploads live in every desktop's data folder at "@data/cloud/<file id>/<name>". */
export const cloudUri = (f: FileRef) => `@data/cloud/${f.id}/${f.name.replace(/[\\/:*?"<>|]/g, "_")}`;
export const isCloudUri = (uri: string) => uri.startsWith("@data/cloud/");

// ---------------------------------------------------------------- equality (same rules as Rust row_eq)
const canon = (v: unknown): string => {
  if (Array.isArray(v)) return `[${v.map(canon).join(",")}]`;
  if (v && typeof v === "object") return `{${Object.keys(v).sort().map((k) => `${JSON.stringify(k)}:${canon((v as Row)[k])}`).join(",")}}`;
  return JSON.stringify(v ?? null);
};
const sameJsonText = (a: unknown, b: unknown) => {
  if (typeof a !== "string" || typeof b !== "string") return a === b;
  try { return canon(JSON.parse(a)) === canon(JSON.parse(b)); } catch { return a === b; }
};
const valEq = (a: unknown, b: unknown) => {
  const n = (x: unknown) => (typeof x === "boolean" ? Number(x) : x ?? null);
  return n(a) === n(b);
};
export function rowEq(a?: Row, b?: Row): boolean {
  if (!a || !b) return !a && !b;
  for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) if (!valEq(a[k], b[k])) return false;
  return true;
}

// ---------------------------------------------------------------- merge (port of sync.rs)
export function merge(local: Snapshot, remote: Snapshot, base: Snapshot | null): Snapshot {
  const out: Snapshot = { format: 1, tables: {} };
  for (const t of TABLES) {
    const l = local.tables[t] ?? {}, r = remote.tables[t] ?? {}, b = base?.tables[t];
    const merged: Record<string, Row> = {};
    for (const k of new Set([...Object.keys(l), ...Object.keys(r), ...Object.keys(b ?? {})])) {
      const lv = l[k], rv = r[k], bv = b?.[k];
      let pick: Row | undefined;
      if (rowEq(lv, rv)) pick = lv;
      else if (base && rowEq(lv, bv)) pick = rv;
      else if (base && rowEq(rv, bv)) pick = lv;
      else if (lv && rv) {
        const tl = Number(lv.updated_at ?? 0), tr = Number(rv.updated_at ?? 0);
        // newer edit wins; without timestamps a joining device (no base) takes the cloud's version
        pick = tr > tl || (tr === tl && !base) ? rv : lv;
      }
      else pick = lv ?? rv;
      if (pick) merged[k] = pick;
    }
    out.tables[t] = merged;
  }
  dedupeTags(out);
  return out;
}

/** Same rule as the desktop: one tag per (kind, name); the smallest id wins, links move to it. */
export function dedupeTags(s: Snapshot) {
  const tags = s.tables.tags ?? {};
  const keyOfTag = (r: Row) => `${r.category}\u0000${String(r.name ?? "").toLowerCase()}`;
  const keep = new Map<string, string>();
  for (const [id, r] of Object.entries(tags)) { const k = keyOfTag(r); const cur = keep.get(k); if (cur === undefined || id < cur) keep.set(k, id); }
  const remap = new Map<string, string>();
  for (const [id, r] of Object.entries(tags)) { const to = keep.get(keyOfTag(r))!; if (to !== id) remap.set(id, to); }
  if (!remap.size) return;
  for (const id of remap.keys()) delete tags[id];
  const links = s.tables.item_tags ?? {};
  const next: Record<string, Row> = {};
  for (const r of Object.values(links)) {
    const row: Row = { ...r, tag_id: remap.get(String(r.tag_id)) ?? r.tag_id };
    const k = `${row.item_id}\u001f${row.tag_id}`;
    next[k] ??= row;
  }
  s.tables.item_tags = next;
}

export function changes(a: Snapshot, b: Snapshot): number {
  let n = 0;
  for (const t of TABLES) {
    const x = a.tables[t] ?? {}, y = b.tables[t] ?? {};
    for (const k of new Set([...Object.keys(x), ...Object.keys(y)])) if (!rowEq(x[k], y[k])) n++;
  }
  return n;
}

// ---------------------------------------------------------------- browser data → snapshot

/**
 * `ref` = the last snapshot this browser agreed on: its rows supply columns the web version does not
 * know (and the desktop's exact JSON text when the content is the same), so unchanged rows stay equal.
 */
export function toSnapshot(db: DB, ref: Snapshot | null): Snapshot {
  const tables: Snapshot["tables"] = Object.fromEntries(TABLES.map((t) => [t, {}]));
  const put = (t: string, row: Row) => {
    const k = keyOf(t, row);
    const old = ref?.tables[t]?.[k];
    const full: Row = { ...(old ?? {}), ...row };
    for (const c of JSON_COLS[t] ?? []) if (old && sameJsonText(old[c], full[c])) full[c] = old[c];
    tables[t][k] = full;
  };
  const created = (t: string, id: string) => (ref?.tables[t]?.[id]?.created_at as number | undefined) ?? Date.now();

  db.archives.forEach((a: Archive) => put("archives", { id: a.id, name: a.name, icon: a.icon, kind: a.kind, position: a.position, pinned: a.pinned ? 1 : 0, format: a.format ?? null, deleted_at: a.deletedAt ?? null, created_at: (ref?.tables.archives?.[a.id]?.created_at as number | undefined) ?? 0 }));
  db.statuses.forEach((s: StatusDef) => put("statuses", { id: s.id, label: s.label, icon: s.icon, color: s.color, position: s.position }));
  db.fields.forEach((f: FieldDef) => put("field_defs", { id: f.id, name: f.name, type: f.type, options: JSON.stringify(f.options ?? []), position: f.position }));
  db.views.forEach((v: View) => put("views", { id: v.id, name: v.name, icon: v.icon, position: v.position, config: JSON.stringify({ layout: v.layout, query: v.query, card: v.card, columns: v.columns }) }));
  db.tags.forEach((t: Tag) => put("tags", { id: t.id, name: t.name, category: t.category, color: t.color ?? null, created_at: created("tags", t.id) }));
  db.categories.forEach((c: Category) => put("categories", { id: c.id, parent_id: c.parentId, kind: c.kind, name: c.name, position: c.position, color: c.color ?? null, deleted_at: c.deletedAt ?? null, trash_group: c.trashGroup ?? null, created_at: created("categories", c.id) }));

  // items switched off in the cloud icon stay in this browser only
  const items: (Item & { deletedAt?: number; trashGroup?: string | null })[] = [...db.items, ...db.trash].filter((it) => it.props?._cloud !== false);
  for (const it of items) {
    put("items", {
      id: it.id, title: it.title, kind: it.kind, status: it.status, rating: it.rating, favorite: it.favorite ? 1 : 0,
      cover_uri: it.coverUri, banner_uri: it.bannerUri, summary: it.summary, year: it.year, url: it.url, code: it.code,
      source: it.source ? JSON.stringify(it.source) : null, props: JSON.stringify(it.props ?? {}), blocks: JSON.stringify(it.blocks ?? []),
      created_at: it.createdAt, updated_at: it.updatedAt, deleted_at: it.deletedAt ?? null, trash_group: it.trashGroup ?? null, list: it.list, archive_id: it.archiveId, pinned: it.pinned ? 1 : 0,
    });
    it.tags.forEach((t, i) => put("item_tags", { item_id: it.id, tag_id: t.id, position: i }));
    (it.categoryIds ?? []).forEach((c) => put("item_categories", { item_id: it.id, category_id: c }));
    for (const f of it.files) {
      if (isBrowserFile(f)) continue;
      put("files", { id: f.id, item_id: it.id, provider: f.provider, uri: f.uri, name: f.name, kind: f.kind, size: f.size, mtime: f.mtime, created_at: f.createdAt });
    }
  }
  for (const [key, value] of Object.entries(db.settings)) put("settings", { key, value: JSON.stringify(value) });
  return { format: 1, tables };
}

// ---------------------------------------------------------------- snapshot → browser data

const parse = <T,>(v: unknown, fallback: T): T => {
  if (typeof v !== "string") return fallback;
  try { return JSON.parse(v) as T; } catch { return fallback; }
};
const num = (v: unknown) => (v === null || v === undefined ? null : Number(v));

/** Browser data equal to `snap`; files uploaded in this browser are kept on their items. */
export function fromSnapshot(snap: Snapshot, prev: DB): DB {
  const T = (t: string) => Object.values(snap.tables[t] ?? {});
  const tags = T("tags").map((r): Tag => ({ id: String(r.id), name: String(r.name), category: r.category as Tag["category"], color: (r.color as string) ?? null }));
  const tagById = new Map(tags.map((t) => [t.id, t]));
  const itemTags = new Map<string, { tag: Tag; pos: number }[]>();
  for (const r of T("item_tags")) {
    const tag = tagById.get(String(r.tag_id));
    if (tag) itemTags.set(String(r.item_id), [...(itemTags.get(String(r.item_id)) ?? []), { tag, pos: Number(r.position ?? 0) }]);
  }
  const itemCats = new Map<string, string[]>();
  for (const r of T("item_categories")) itemCats.set(String(r.item_id), [...(itemCats.get(String(r.item_id)) ?? []), String(r.category_id)]);
  const files = new Map<string, FileRef[]>();
  for (const r of T("files")) {
    const f: FileRef = { id: String(r.id), itemId: String(r.item_id), provider: r.provider as FileRef["provider"], uri: String(r.uri), name: String(r.name), kind: r.kind as FileRef["kind"], size: num(r.size), mtime: num(r.mtime), createdAt: Number(r.created_at ?? 0) };
    files.set(f.itemId, [...(files.get(f.itemId) ?? []), f]);
  }
  const inSnap = new Set(Object.keys(snap.tables.items ?? {}));
  const localOnly = [...prev.items, ...prev.trash].filter((it) => it.props?._cloud === false && !inSnap.has(it.id));
  const browserFiles = new Map<string, FileRef[]>();
  for (const it of [...prev.items, ...prev.trash]) {
    const keep = it.files.filter(isBrowserFile);
    if (keep.length) browserFiles.set(it.id, keep);
  }

  const items: Item[] = [], trash: DB["trash"] = [];
  for (const r of T("items")) {
    const id = String(r.id);
    const it: Item = {
      id, title: String(r.title), kind: r.kind as Item["kind"], status: String(r.status), rating: num(r.rating), favorite: !!Number(r.favorite),
      coverUri: (r.cover_uri as string) ?? null, bannerUri: (r.banner_uri as string) ?? null, summary: (r.summary as string) ?? null,
      year: num(r.year), url: (r.url as string) ?? null, code: (r.code as string) ?? null, source: parse(r.source, null),
      props: parse(r.props, {}), blocks: parse(r.blocks, []), createdAt: Number(r.created_at), updatedAt: Number(r.updated_at),
      list: (r.list as Item["list"]) ?? "archive", archiveId: (r.archive_id as string) ?? null, pinned: !!Number(r.pinned),
      tags: (itemTags.get(id) ?? []).sort((a, b) => a.pos - b.pos).map((x) => x.tag),
      categoryIds: itemCats.get(id) ?? [],
      files: [...(files.get(id) ?? []), ...(browserFiles.get(id) ?? [])],
    };
    if (r.deleted_at !== null && r.deleted_at !== undefined) trash.push({ ...it, deletedAt: Number(r.deleted_at), trashGroup: (r.trash_group as string) ?? null });
    else items.push(it);
  }
  for (const it of localOnly) {
    const { deletedAt } = it as Item & { deletedAt?: number };
    if (deletedAt) trash.push(it as Item & { deletedAt: number }); else items.push(it);
  }
  items.sort((a, b) => b.createdAt - a.createdAt);
  trash.sort((a, b) => b.deletedAt - a.deletedAt);

  const views = T("views").map((r): View => {
    const c = parse<Record<string, unknown>>(r.config, {});
    // fill settings an older / other copy may not have
    const card = { ...DEFAULT_CARD, ...((c.card as Partial<View["card"]>) ?? {}) };
    if (!Array.isArray(card.fields)) card.fields = [...DEFAULT_CARD.fields];
    const columns = Array.isArray(c.columns) && c.columns.length ? (c.columns as View["columns"]) : [...DEFAULT_COLUMNS];
    return { id: String(r.id), name: String(r.name), icon: String(r.icon), position: Number(r.position), layout: (c.layout as View["layout"]) ?? "gallery", query: (c.query as View["query"]) ?? {}, card, columns };
  }).sort((a, b) => a.position - b.position);

  return {
    items, trash, tags, views, watch: prev.watch,
    archives: T("archives").map((r): Archive => ({ id: String(r.id), name: String(r.name), icon: String(r.icon), kind: r.kind as Archive["kind"], position: Number(r.position), pinned: !!Number(r.pinned), format: (r.format as string) ?? null, deletedAt: num(r.deleted_at) })).sort((a, b) => a.position - b.position),
    statuses: T("statuses").map((r): StatusDef => ({ id: String(r.id), label: String(r.label), icon: String(r.icon), color: String(r.color), position: Number(r.position) })).sort((a, b) => a.position - b.position),
    fields: T("field_defs").map((r): FieldDef => ({ id: String(r.id), name: String(r.name), type: r.type as FieldDef["type"], options: parse(r.options, []), position: Number(r.position) })).sort((a, b) => a.position - b.position),
    categories: T("categories").map((r): Category => ({ id: String(r.id), parentId: (r.parent_id as string) ?? null, kind: (r.kind as Category["kind"]) ?? null, name: String(r.name), position: Number(r.position), color: (r.color as string) ?? null, deletedAt: num(r.deleted_at), trashGroup: (r.trash_group as string) ?? null })),
    settings: Object.fromEntries(T("settings").map((r) => [String(r.key), parse(r.value, null)])),
  };
}

/** "@cache/…" images (desktop covers) referenced by the snapshot. */
export function cacheRefs(s: Snapshot): string[] {
  const out = new Set<string>();
  for (const r of Object.values(s.tables.items ?? {})) for (const c of ["cover_uri", "banner_uri"]) {
    const p = r[c];
    if (typeof p === "string" && p.startsWith("@cache/")) out.add(p);
  }
  return [...out];
}
