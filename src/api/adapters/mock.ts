import { isAniName, parseAni } from "@/lib/ani";
import { unzipSync } from "fflate";
import type { ApiClient } from "../client";
import type {
  Archive, Candidate, Category, StatusDef, FieldDef, FileKind, FileRef, ID, Item, ItemQuery, Kind, ListKind, NewItem, Tag, TagCategory, View,
  TrashGroup, WatchFolder,
} from "../types";
import { DEFAULT_VIEWS } from "@/lib/defaults";
import { searchAniList } from "@/lib/anilist";
import { kindFromLink } from "@/lib/links";
import { ARCHIVE_KINDS } from "@/lib/kinds";
import { itunesSearch, parseCover, sameText, youtubeId, youtubeSong, youtubeVideo, ytmSearchLink } from "@/lib/webMusic";
import { ytmFind, ytmLyrics, ytmSearch } from "@/lib/ytm";
import { ytApiSearch } from "@/lib/ytApi";
import { DEFAULT_STATUSES } from "@/lib/statuses";

/** A library starts with one plain archive (fixed id, so every device makes the same one). */
const builtinArchives = (): Archive[] => [{ id: "archive1", name: "아카이브 1", icon: "library", kind: "other", position: 0, pinned: false }];
const OLD_BUILTIN = new Set<string>([...ARCHIVE_KINDS]);

/** Same as the desktop's migration 7: drop the old per-kind archives that hold nothing. */
export function normalizeArchives(db: DB): DB {
  const used = new Set([...db.items, ...db.trash].map((i) => i.archiveId));
  const drop = new Set(db.archives.filter((a) => OLD_BUILTIN.has(a.id) && !used.has(a.id)).map((a) => a.id));
  if (drop.size) {
    db.archives = db.archives.filter((a) => !drop.has(a.id));
    db.views = db.views.filter((v) => !(v.id.startsWith("arc:") && drop.has(v.id.slice(4).replace(/:wish$/, ""))));
  }
  if (!db.archives.length) db.archives = builtinArchives();
  folderArchives(db);
  songLinks(db);
  return db;
}

/** Songs saved with an Apple Music page as their link get the YouTube Music link (a search for the song). */
function songLinks(db: DB) {
  for (const it of [...db.items, ...db.trash]) {
    if (!it.url || !/music\.apple\.com/.test(it.url)) continue;
    it.url = ytmSearchLink(it.title, it.tags.find((t) => t.category === "author")?.name ?? "");
  }
}

/** Same as the desktop's migration 9: a folder without an archive goes to the one most of its items are in. */
function folderArchives(db: DB) {
  if (!db.categories?.some((c) => c.archiveId === undefined || c.archiveId === null)) return;
  const byId = new Map(db.categories.map((c) => [c.id, c]));
  const root = (c: Category) => { let r = c; for (let i = 0; r.parentId && byId.has(r.parentId) && i < 50; i++) r = byId.get(r.parentId)!; return r; };
  const votes = new Map<string, Map<string, number>>();
  for (const it of [...db.items, ...db.trash]) {
    if (!it.archiveId) continue;
    for (const cid of it.categoryIds) {
      const c = byId.get(cid); if (!c) continue;
      const v = votes.get(root(c).id) ?? new Map<string, number>();
      v.set(it.archiveId, (v.get(it.archiveId) ?? 0) + 1); votes.set(root(c).id, v);
    }
  }
  const first = [...db.archives].filter((a) => !a.deletedAt).sort((a, b) => Number(b.pinned) - Number(a.pinned) || a.position - b.position)[0]?.id ?? null;
  for (const c of db.categories) {
    if (c.parentId || c.archiveId) continue;
    const v = [...(votes.get(c.id) ?? new Map<string, number>())].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
    c.archiveId = v[0]?.[0] ?? first;
  }
  for (const c of db.categories) if (c.parentId) c.archiveId = root(c).archiveId ?? null;
}

/**
 * In-browser backend for UI development (`npm run dev` without Tauri).
 * Persists to localStorage. Implements the same semantics as curio-core.
 * Uploaded files (browser) live in memory for the session.
 */

const KEY = "curio.mock.v4";
let useAppError: (msg: string) => void = () => {};
/** Lets the mock report a message through the app's error toast without importing the store (avoids a cycle). */
export const setMockErrorSink = (fn: (msg: string) => void) => { useAppError = fn; };

export interface DB {
  items: Item[];
  tags: Tag[];
  fields: FieldDef[];
  views: View[];
  categories: Category[];
  watch: WatchFolder[];
  archives: Archive[];
  statuses: StatusDef[];
  trash: (Item & { deletedAt: number; trashGroup?: string | null })[];
  settings: Record<string, unknown>;
}

const uid = () =>
  (crypto as Crypto & { randomUUID?: () => string }).randomUUID?.() ??
  Math.random().toString(36).slice(2) + Date.now().toString(36);
const now = () => Date.now();
const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v));

// ---------- placeholder covers (generated SVG, no network) ----------
const PALETTES = [
  ["#ff9a8b", "#ff6a88"], ["#a1c4fd", "#c2e9fb"], ["#84fab0", "#8fd3f4"], ["#fccb90", "#d57eeb"],
  ["#e0c3fc", "#8ec5fc"], ["#f6d365", "#fda085"], ["#5ee7df", "#b490ca"], ["#c79081", "#dfa579"],
  ["#30cfd0", "#330867"], ["#43e97b", "#38f9d7"], ["#fa709a", "#fee140"], ["#667eea", "#764ba2"],
];
export function svgCover(seed: number, title: string, w = 400, h = 600): string {
  const [a, b] = PALETTES[seed % PALETTES.length];
  const initial = [...title][0] ?? "?";
  const r = Math.min(w, h);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}">
<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient></defs>
<rect width="${w}" height="${h}" fill="url(#g)"/>
<circle cx="${(w * (0.2 + ((seed * 37) % 60) / 100)).toFixed(0)}" cy="${(h * (0.2 + ((seed * 53) % 50) / 100)).toFixed(0)}" r="${(r * (0.22 + (seed % 4) * 0.07)).toFixed(0)}" fill="#fff" opacity=".14"/>
<circle cx="${(w * (0.8 - ((seed * 29) % 50) / 100)).toFixed(0)}" cy="${(h * (0.8 - ((seed * 17) % 40) / 100)).toFixed(0)}" r="${(r * (0.15 + (seed % 3) * 0.06)).toFixed(0)}" fill="#000" opacity=".07"/>
<text x="${w / 2}" y="${h / 2 + r * 0.13}" font-family="sans-serif" font-size="${(r * 0.36).toFixed(0)}" font-weight="700" text-anchor="middle" fill="#fff" opacity=".9">${initial}</text>
</svg>`;
  return "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
}

function seed(): DB {
  const t = now();
  const tags: Tag[] = [];
  const tag = (name: string, category: TagCategory): Tag => {
    let x = tags.find((y) => y.name === name && y.category === category);
    if (!x) { x = { id: uid(), name, category, color: null }; tags.push(x); }
    return x;
  };
  const categories: Category[] = [];
  const cat = (name: string, parent: Category | null, kind: Kind | null): Category => {
    const c = { id: uid(), parentId: parent?.id ?? null, kind, name, position: categories.length };
    categories.push(c);
    return c;
  };
  const fan = cat("팬아트", null, "illust");
  const fanFrieren = cat("프리렌", fan, "illust");
  cat("원신", fan, "illust");
  const orig = cat("오리지널", null, "illust");
  const bg = cat("배경", orig, "illust");
  const wall = cat("배경화면", null, "illust");

  type Row = {
    title: string; kind: Kind; list?: ListKind; status?: Item["status"]; rating?: number | null; fav?: boolean;
    tags?: [string, TagCategory][]; files?: [string, FileKind, number][]; year?: number; url?: string; code?: string;
    cats?: Category[]; size?: [number, number]; summary?: string;
  };
  const rows: Row[] = [
    // illust (varied aspect ratios for masonry)
    { title: "Neon Rain Study", kind: "illust", rating: 4, tags: [["Mori", "author"], ["사이버펑크", "tag"]], cats: [bg], size: [400, 560], files: [["neon_rain_8k.png", "image", 38_000_000]] },
    { title: "숲의 목소리", kind: "illust", rating: 4.5, fav: true, tags: [["하늘공방", "author"], ["판타지", "tag"]], cats: [orig], size: [400, 300] },
    { title: "프리렌 팬아트 #3", kind: "illust", tags: [["Kuro", "author"], ["프리렌", "series"]], cats: [fanFrieren], size: [400, 640] },
    { title: "Blue Hour", kind: "illust", tags: [["Mori", "author"]], cats: [wall], size: [400, 225] },
    { title: "바다 위 정거장", kind: "illust", rating: 5, fav: true, tags: [["하늘공방", "author"], ["풍경", "tag"]], cats: [bg], size: [400, 400] },
    { title: "Sketch 0412", kind: "illust", tags: [["Kuro", "author"], ["스케치", "tag"]], cats: [orig], size: [400, 520] },
    { title: "프리렌 & 페른", kind: "illust", tags: [["Kuro", "author"], ["프리렌", "series"]], cats: [fanFrieren], size: [400, 500] },
    { title: "Star Garden", kind: "illust", tags: [["Mori", "author"]], cats: [wall], size: [400, 250] },
    // game
    { title: "Starfall Odyssey", kind: "game", status: "in_progress", rating: 4.5, tags: [["Nova Works", "studio"], ["RPG", "genre"]], year: 2024 },
    { title: "Pixel Farm Days", kind: "game", status: "completed", rating: 4, tags: [["Tiny Seed", "studio"], ["시뮬레이션", "genre"]], year: 2022 },
    { title: "Echoes of the Abyss", kind: "game", list: "wishlist", tags: [["Deep Studio", "studio"], ["액션", "genre"]] },
    // anime
    { title: "별빛 정원의 마녀", kind: "anime", status: "completed", rating: 4.5, fav: true, tags: [["Kuro Studio", "studio"], ["김감독", "director"], ["판타지", "genre"]], files: [["S01", "folder", 0], ["E01.mkv", "video", 1_420_000_000]], year: 2023 },
    { title: "바다 아래 도서관", kind: "anime", status: "in_progress", tags: [["Kuro Studio", "studio"], ["판타지", "genre"]], year: 2025 },
    { title: "The Last Lighthouse", kind: "anime", status: "dropped", rating: 2, tags: [["SF", "genre"]] },
    { title: "여름의 끝에서", kind: "anime", list: "wishlist", tags: [["일상", "genre"]] },
    // webtoon
    { title: "궤도 엘리베이터", kind: "webtoon", status: "in_progress", tags: [["하늘공방", "author"], ["SF", "genre"]], url: "https://comic.naver.com" },
    { title: "Clockwork Garden", kind: "webtoon", status: "completed", rating: 4, tags: [["이서윤", "author"], ["판타지", "genre"]] },
    // light novel / web novel
    { title: "늑대와 향신료 같은 무언가", kind: "light_novel", status: "completed", rating: 4.5, tags: [["하세쿠라", "author"], ["로맨스", "genre"]] },
    { title: "회귀한 마법사의 서재", kind: "web_novel", status: "in_progress", tags: [["글쓴이", "author"], ["판타지", "genre"]] },
    { title: "탑을 오르는 자", kind: "web_novel", list: "wishlist", tags: [["판타지", "genre"]] },
    // music
    { title: "Night Drive", kind: "music", rating: 5, fav: true, tags: [["Lumi", "author"], ["City Pop", "genre"]], url: "https://music.youtube.com/watch?v=ZRtdQ81jPUQ", size: [400, 400] },
    { title: "Paper Planes", kind: "music", rating: 4, tags: [["Aoi", "author"]], url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ", size: [400, 400] },
    // doujin
    { title: "여름 끝의 편지", kind: "doujin", status: "completed", rating: 5, fav: true, tags: [["하늘공방", "circle"], ["로맨스", "genre"]], files: [["summer_letter.zip", "archive", 64_000_000]], code: "RJ01234567" },
    { title: "하루의 끝, 너의 시작", kind: "doujin", list: "wishlist", tags: [["코믹월드 2026", "tag"]] },
    // catalog (품번)
    { title: "한정판 아트북 Vol.2", kind: "catalog", code: "ABC-123", tags: [["Studio K", "studio"]], year: 2025 },
    { title: "피규어 1/7 스케일", kind: "catalog", list: "wishlist", code: "FIG-007", tags: [["Good Maker", "publisher"]] },
    // manga
    { title: "고양이와 나의 365일", kind: "manga", status: "in_progress", rating: 3.5, tags: [["이서윤", "author"], ["일상", "genre"]], files: [["vol01.cbz", "archive", 182_000_000]] },
  ];
  const items: Item[] = rows.map((r, i) => {
    const id = uid();
    const created = t - (rows.length - i) * 86_400_000 * 2;
    const [w, h] = r.size ?? [400, 600];
    return {
      id, title: r.title, kind: r.kind, archiveId: r.kind, pinned: false, list: r.list ?? "archive", status: r.status ?? (r.list === "wishlist" ? "planned" : "completed"),
      rating: r.rating ?? null, favorite: !!r.fav, coverUri: svgCover(i, r.title, w, h), bannerUri: null,
      summary: r.summary ?? null, year: r.year ?? null, url: r.url ?? null, code: r.code ?? null, source: null,
      categoryIds: (r.cats ?? []).map((c) => c.id),
      tags: (r.tags ?? []).map(([n, c]) => tag(n, c)),
      props: {},
      files: (r.files ?? []).map(([name, fk, size]) => ({
        id: uid(), itemId: id, provider: "local", uri: `D:/Archive/${r.title}/${name}`, name, kind: fk, size: size || null, mtime: created, createdAt: created,
      })),
      blocks: i === 11 ? [
        { id: uid(), type: "heading", text: "감상 메모" },
        { id: uid(), type: "paragraph", text: "2화 연출이 특히 좋았다. OST 따로 찾아볼 것." },
        { id: uid(), type: "todo", text: "블루레이 특전 소책자 스캔", checked: false },
      ] : [],
      createdAt: created,
      updatedAt: created + (i % 5) * 3_600_000,
    };
  });
  const fields: FieldDef[] = [
    { id: uid(), name: "보관 위치", type: "select", options: ["NAS", "외장 SSD", "책장"], position: 0 },
  ];
  items.forEach((it) => { it.archiveId = "archive1"; it.pinned = false; });
  return { items, tags, fields, views: clone(DEFAULT_VIEWS), categories, watch: [], archives: builtinArchives(), statuses: clone(DEFAULT_STATUSES), trash: [], settings: {} };
}

/** A new, empty library (built-in archives, statuses and views only) — the web version starts here. */
export function emptyDb(): DB {
  return { items: [], tags: [], fields: [], views: clone(DEFAULT_VIEWS), categories: [], watch: [], archives: builtinArchives(), statuses: clone(DEFAULT_STATUSES), trash: [], settings: {} };
}

function load(): DB {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return JSON.parse(raw);
  } catch { /* ignore */ }
  const db = seed();
  save(db);
  return db;
}
function save(db: DB) {
  try { localStorage.setItem(KEY, JSON.stringify(db)); } catch { /* quota / private mode */ }
}

function descendants(cats: Category[], id: ID): Set<ID> {
  const out = new Set<ID>([id]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const c of cats) if (c.parentId && out.has(c.parentId) && !out.has(c.id)) { out.add(c.id); grew = true; }
  }
  return out;
}

export function applyQuery(items: Item[], q: ItemQuery, cats: Category[] = []): Item[] {
  const s = q.search?.trim().toLowerCase();
  const catSet = q.categoryId ? descendants(cats, q.categoryId) : null;
  let out = items.filter((it) => {
    if (q.kinds?.length && !q.kinds.includes(it.kind)) return false;
    if (q.fileKinds?.length && !it.files.some((f) => q.fileKinds!.includes(f.kind))) return false;
    if (q.archiveId && it.archiveId !== q.archiveId) return false;
    if (q.list && it.list !== q.list) return false;
    if (q.statuses?.length && !q.statuses.includes(it.status)) return false;
    if (q.favorite && !it.favorite) return false;
    if (q.minRating && (it.rating ?? 0) < q.minRating) return false;
    if (q.tagIds?.length && !q.tagIds.every((id) => it.tags.some((t) => t.id === id))) return false;
    if (catSet && !it.categoryIds.some((c) => catSet.has(c))) return false;
    if (s && ![it.title, it.code ?? "", it.summary ?? "", ...it.tags.map((t) => t.name)].some((x) => x.toLowerCase().includes(s))) return false;
    return true;
  });
  const { field, dir } = q.sort ?? { field: "updatedAt", dir: "desc" };
  const m = dir === "asc" ? 1 : -1;
  out = out.sort((a, b) => {
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
    const av = a[field] ?? -1, bv = b[field] ?? -1;
    // numbers inside titles compare as numbers: 3화 < 10화 < 113화
    if (typeof av === "string" && typeof bv === "string") return av.localeCompare(bv, "ko", { numeric: true, sensitivity: "base" }) * m;
    return ((av as number) - (bv as number)) * m;
  });
  return out;
}

export function kindFromName(name: string): FileKind {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  if (["mp4", "mkv", "webm", "avi", "mov", "m4v"].includes(ext)) return "video";
  if (["mp3", "flac", "wav", "m4a", "ogg", "oga", "aac", "opus"].includes(ext)) return "audio";
  if (["txt", "md", "markdown", "log", "csv", "json", "yaml", "yml", "srt", "vtt"].includes(ext)) return "text";
  if (["zip", "cbz", "rar", "cbr", "7z"].includes(ext)) return "archive";
  if (["jpg", "jpeg", "png", "webp", "gif", "avif", "bmp", "psd", "ani", "ico", "cur"].includes(ext)) return "image";
  if (["pdf", "epub"].includes(ext)) return "document";
  return name.includes(".") ? "other" : "folder";
}

const IMG_RE = /\.(jpe?g|png|webp|gif|avif|bmp)$/i;
const imageMime = (n: string) => {
  const e = n.split(".").pop()!.toLowerCase();
  return e === "jpg" ? "image/jpeg" : `image/${e}`;
};
const natural = (a: string, b: string) => a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" });

/** Session-only blobs for browser uploads (fileId → File). */
/**
 * Uploaded files. Kept in IndexedDB as well so they survive a reload of the preview (before, items
 * stayed but their files vanished → "파일이 없어요"). Falls back to memory where storage is blocked.
 */
const blobs = (() => {
  const mem = new Map<ID, File>();
  let db: Promise<IDBDatabase | null>;
  try {
    db = new Promise((res) => {
      const r = indexedDB.open("curio-mock-files", 1);
      r.onupgradeneeded = () => r.result.createObjectStore("files");
      r.onsuccess = () => res(r.result);
      r.onerror = () => res(null);
    });
  } catch { db = Promise.resolve(null); }
  const tx = (mode: IDBTransactionMode, run: (st: IDBObjectStore) => void) =>
    void db.then((d) => { try { if (d) run(d.transaction("files", mode).objectStore("files")); } catch { /* quota / closed */ } });
  const ready: Promise<void> = db.then((d) => new Promise<void>((res) => {
    if (!d) return res();
    try {
      const st = d.transaction("files").objectStore("files");
      const req = st.openCursor();
      req.onsuccess = () => {
        const c = req.result;
        if (!c) return res();
        if (!mem.has(c.key as ID)) mem.set(c.key as ID, c.value as File);
        c.continue();
      };
      req.onerror = () => res();
    } catch { res(); }
  }));
  return {
    ready,
    get: (id: ID) => mem.get(id),
    set(id: ID, f: File) { mem.set(id, f); tx("readwrite", (st) => st.put(f, id)); },
    delete(id: ID) { mem.delete(id); tx("readwrite", (st) => st.delete(id)); },
  };
})();
const pageCache = new Map<ID, { names: string[]; urls: string[] }>();
/** Web version: keep a file fetched from Drive (stored like an upload, so every viewer works). */
export const putMockBlob = (id: ID, f: File) => { blobs.set(id, f); pageCache.delete(id); };
export const hasMockBlob = (id: ID) => !!blobs.get(id);
export const getMockBlob = (id: ID): File | undefined => blobs.get(id);
export const mockBlobsReady = () => blobs.ready;

/** hitomi.la gallery info (the site allows reading it from any page; its images need hitomi.la itself). */
async function hitomiGallery(id: string): Promise<Candidate> {
  const js = await (await fetch(`https://ltn.gold-usergeneratedcontent.net/galleries/${id}.js`, { signal: AbortSignal.timeout(10000) })).text();
  const g = JSON.parse(js.replace(/^\s*var galleryinfo\s*=\s*/, "").replace(/;\s*$/, ""));
  const list = (v: unknown, k: string): string[] => (Array.isArray(v) ? v.map((x) => x?.[k]).filter((x): x is string => typeof x === "string") : []);
  const pages = Array.isArray(g.files) ? g.files.length : 0;
  return {
    provider: "hitomi", id, title: String(g.title ?? ""), altTitles: g.japanese_title ? [String(g.japanese_title)] : [],
    kind: g.type === "doujinshi" ? "doujin" : "manga", year: Number(String(g.date ?? "").slice(0, 4)) || null, coverUrl: null, bannerUrl: null, summary: null,
    people: [...list(g.artists, "artist").map((name) => ({ name, category: "author" as const, role: "Artist" })), ...list(g.groups, "group").map((name) => ({ name, category: "circle" as const, role: "Group" }))],
    genres: list(g.tags, "tag").slice(0, 20), series: list(g.parodys, "parody").find((p) => p !== "original") ?? null,
    url: `https://hitomi.la/galleries/${id}.html`, code: null,
    detail: [g.type, g.language_localname ?? g.language, pages ? `${pages}쪽` : ""].filter(Boolean).join(" · ") || null,
  };
}

/** Direct access to the engine's data (used by the web version's Drive sync). */
export const mockDb: { get(): DB; set(next: DB): void } = { get: () => { throw new Error("not ready"); }, set: () => undefined };

export function createMockClient(opts?: { db?: DB; persist?: (db: DB) => void }): ApiClient {
  let db = opts?.db ?? load();
  db.categories ??= [];
  db.watch ??= [];
  db.archives ??= builtinArchives();
  normalizeArchives(db);
  db.statuses ??= clone(DEFAULT_STATUSES);
  db.trash ??= [];
  db.settings ??= {};
  const commit = () => (opts?.persist ?? save)(db);
  mockDb.get = () => db;
  mockDb.set = (next) => { db = normalizeArchives(next); commit(); };
  const find = (id: ID) => {
    const it = db.items.find((x) => x.id === id);
    if (!it) throw new Error(`item ${id} not found`);
    return it;
  };
  const delay = <T,>(v: T) => new Promise<T>((r) => setTimeout(() => r(clone(v)), 20));
  const upsertTag = (name: string, category: TagCategory): Tag => {
    let t = db.tags.find((x) => x.category === category && x.name.toLowerCase() === name.trim().toLowerCase());
    if (!t) { t = { id: uid(), name: name.trim(), category, color: null }; db.tags.push(t); }
    return t;
  };
  const insert = (input: NewItem): Item => {
    const t = now();
    const it: Item = {
      id: uid(), title: input.title.trim() || "제목 없음", kind: input.kind ?? "other",
      archiveId: input.archiveId ?? (db.archives.some((a) => a.id === input.kind && !a.deletedAt) ? input.kind! : null), pinned: false, list: input.list ?? "archive",
      status: input.status ?? "planned", rating: input.rating ?? null, favorite: false, coverUri: input.coverUri ?? null,
      bannerUri: null, summary: input.summary ?? null, year: input.year ?? null, url: input.url ?? null,
      code: input.code ? input.code.toUpperCase() : null, source: null, categoryIds: input.categoryIds ?? [],
      tags: (input.tags ?? []).map((nt) => upsertTag(nt.name, nt.category)), props: {}, files: [], blocks: [],
      createdAt: t, updatedAt: t,
    };
    db.items.unshift(it);
    return it;
  };

  /** Deleted archives / top folders still in the trash. */
  const trashGroups = (): TrashGroup[] => {
    const count = (g: string) => db.trash.filter((x) => x.trashGroup === g).length;
    return [
      ...db.archives.filter((a) => a.deletedAt).map((a) => ({ id: `arc:${a.id}`, name: a.name, icon: a.icon, color: null, deletedAt: a.deletedAt!, count: count(`arc:${a.id}`) })),
      ...db.categories.filter((c) => c.deletedAt && c.trashGroup === `cat:${c.id}`).map((c) => ({ id: `cat:${c.id}`, name: c.name, icon: null, color: c.color ?? null, deletedAt: c.deletedAt!, count: count(`cat:${c.id}`) })),
    ].sort((a, b) => b.deletedAt - a.deletedAt);
  };
  /** A trashed item made live again; its archive and folders (with parents) come back too. */
  const takeBack = (t: DB["trash"][number]): Item => {
    const { deletedAt: _d, trashGroup: _g, ...item } = t;
    const arc = db.archives.find((a) => a.id === item.archiveId);
    if (arc) arc.deletedAt = null;
    else if (item.archiveId) item.archiveId = db.archives.some((a) => a.id === item.kind && !a.deletedAt) ? item.kind : null;
    const up = new Set(item.categoryIds);
    for (let grew = true; grew;) {
      grew = false;
      for (const c of db.categories) if (up.has(c.id) && c.parentId && !up.has(c.parentId)) { up.add(c.parentId); grew = true; }
    }
    db.categories.forEach((c) => { if (up.has(c.id) && c.deletedAt) { c.deletedAt = null; c.trashGroup = null; } });
    item.updatedAt = now();
    return item;
  };
  const dropCategories = (ids: Set<ID>) => {
    if (!ids.size) return;
    const all = new Set([...ids].flatMap((id) => [...descendants(db.categories, id)]));
    db.categories = db.categories.filter((c) => !all.has(c.id));
    [...db.items, ...db.trash].forEach((it) => { it.categoryIds = it.categoryIds.filter((c) => !all.has(c)); });
  };
  const dropArchives = (ids: Set<ID>) => {
    if (!ids.size) return;
    db.archives = db.archives.filter((a) => !ids.has(a.id));
    db.views = db.views.filter((v) => !(v.id.startsWith("arc:") && ids.has(v.id.slice(4).replace(/:wish$/, ""))));
    db.trash.forEach((it) => { if (it.archiveId && ids.has(it.archiveId)) it.archiveId = null; });
  };

  const api: ApiClient = {
    caps: { platform: "mock", localFiles: false },

    async listItems(q) {
      return delay(applyQuery(db.items, q, db.categories).map(({ blocks: _b, ...rest }) => rest as Item));
    },
    async counts() {
      const m = new Map<string, number>();
      for (const it of db.items) { const k = `${it.archiveId ?? ""}|${it.list}`; m.set(k, (m.get(k) ?? 0) + 1); }
      return [...m].map(([k, count]) => { const [a, list] = k.split("|"); return { archiveId: a || null, list: list as ListKind, count }; });
    },
    async listArchives() { return delay(db.archives.filter((a) => !a.deletedAt).sort((a, b) => Number(b.pinned) - Number(a.pinned) || a.position - b.position)); },
    async saveArchive(a) {
      const i = db.archives.findIndex((x) => x.id === a.id);
      if (i >= 0) db.archives[i] = a; else db.archives.push(a);
      commit(); return delay(a);
    },
    async deleteArchive(id) {
      const t = now();
      const gone = db.items.filter((it) => it.archiveId === id);
      db.trash.unshift(...gone.map((it) => ({ ...it, updatedAt: t, deletedAt: t, trashGroup: `arc:${id}` })));
      db.items = db.items.filter((it) => it.archiveId !== id);
      db.archives.forEach((a) => { if (a.id === id && !a.deletedAt) a.deletedAt = t; });
      db.categories.forEach((c) => { if (c.archiveId === id && !c.deletedAt) { c.deletedAt = t; c.trashGroup = `arc:${id}`; } }); // its folders go with it
      commit(); return gone.length;
    },
    async bulkCreate(inputs) {
      const ids = inputs.map((i) => insert(i).id);
      commit();
      return ids;
    },
    async getItem(id) { return delay(find(id)); },
    async createItem(input) { const it = insert(input); commit(); return delay(it); },
    async updateItem(id, patch) {
      const it = find(id);
      const { tagIds, ...rest } = patch;
      Object.assign(it, rest);
      if (tagIds) it.tags = tagIds.map((tid) => db.tags.find((t) => t.id === tid)).filter(Boolean) as Tag[];
      it.updatedAt = now(); commit();
      return delay(it);
    },
    async deleteItem(id) {
      const it = db.items.find((x) => x.id === id);
      if (it) db.trash.unshift({ ...it, updatedAt: now(), deletedAt: now() });
      db.items = db.items.filter((x) => x.id !== id); commit();
    },
    async listTrash() { return delay(db.trash); },
    async trashCount() {
      const groups = new Set(trashGroups().map((g) => g.id));
      return db.trash.filter((x) => !x.trashGroup || !groups.has(x.trashGroup)).length + groups.size;
    },
    async restoreItem(id) {
      const t = db.trash.find((x) => x.id === id);
      if (!t) throw new Error("휴지통에 없는 항목이에요");
      const item = takeBack(t);
      db.trash = db.trash.filter((x) => x.id !== id); db.items.unshift(item); commit();
      return delay(item);
    },
    async purgeItem(id) { db.trash = db.trash.filter((x) => x.id !== id); commit(); },
    async listTrashGroups() { return delay(trashGroups()); },
    async restoreGroup(g) {
      const arc = g.startsWith("arc:") ? g.slice(4) : null;
      db.archives.forEach((a) => { if (a.id === arc) a.deletedAt = null; });
      db.categories.forEach((c) => { if (c.trashGroup === g) { c.deletedAt = null; c.trashGroup = null; } });
      const back = db.trash.filter((x) => x.trashGroup === g);
      db.trash = db.trash.filter((x) => x.trashGroup !== g);
      db.items.unshift(...back.map(takeBack));
      commit(); return back.length;
    },
    async purgeGroup(g) {
      db.trash = db.trash.filter((x) => x.trashGroup !== g);
      dropCategories(new Set(db.categories.filter((c) => c.trashGroup === g && c.deletedAt).map((c) => c.id)));
      if (g.startsWith("arc:")) dropArchives(new Set([g.slice(4)]));
      commit();
    },
    async emptyTrash() {
      const n = db.trash.length; db.trash = [];
      dropCategories(new Set(db.categories.filter((c) => c.deletedAt).map((c) => c.id)));
      dropArchives(new Set(db.archives.filter((a) => a.deletedAt).map((a) => a.id)));
      commit(); return n;
    },
    async getSettings(key) { return delay((db.settings[key] ?? null) as never); },
    async setSettings(key, value) { db.settings[key] = value; commit(); },

    async listTags() { return delay(db.tags); },
    async upsertTag(name, category) { const t = upsertTag(name, category); commit(); return delay(t); },

    async listCategories() { return delay(db.categories.filter((c) => !c.deletedAt).sort((a, b) => a.position - b.position)); },
    async saveCategory(c) {
      if (c.parentId && descendants(db.categories, c.id).has(c.parentId)) throw new Error("폴더를 자기 안으로 옮길 수 없어요");
      const i = db.categories.findIndex((x) => x.id === c.id);
      if (i >= 0) db.categories[i] = c; else db.categories.push(c);
      commit(); return delay(c);
    },
    async deleteCategory(id) {
      const t = now(), g = `cat:${id}`;
      const sub = descendants(db.categories.filter((c) => !c.deletedAt), id);
      db.categories.forEach((c) => { if (sub.has(c.id) && !c.deletedAt) { c.deletedAt = t; c.trashGroup = g; } });
      const gone = db.items.filter((it) => it.categoryIds.some((c) => sub.has(c)));
      db.trash.unshift(...gone.map((it) => ({ ...it, updatedAt: t, deletedAt: t, trashGroup: g })));
      db.items = db.items.filter((it) => !gone.includes(it));
      commit(); return gone.length;
    },
    async addToCategory(itemIds, categoryId) {
      for (const id of itemIds) { const it = find(id); if (!it.categoryIds.includes(categoryId)) it.categoryIds.push(categoryId); }
      commit();
    },

    async listStatuses() { return delay([...db.statuses].sort((a, b) => a.position - b.position)); },
    async saveStatus(d) {
      const i = db.statuses.findIndex((x) => x.id === d.id);
      if (i >= 0) db.statuses[i] = d; else db.statuses.push(d);
      commit(); return delay(d);
    },
    async deleteStatus(id, fallback) {
      if (db.statuses.length <= 1) throw new Error("상태는 하나 이상 있어야 해요");
      let n = 0;
      db.items.forEach((it) => { if (it.status === id) { it.status = fallback; n++; } });
      db.statuses = db.statuses.filter((x) => x.id !== id);
      commit(); return n;
    },
    async listFields() { return delay([...db.fields].sort((a, b) => a.position - b.position)); },
    async saveField(f) {
      const i = db.fields.findIndex((x) => x.id === f.id);
      if (i >= 0) db.fields[i] = f; else db.fields.push(f);
      commit(); return delay(f);
    },
    async deleteField(id) {
      db.fields = db.fields.filter((f) => f.id !== id);
      db.items.forEach((it) => delete it.props[id]);
      commit();
    },

    async listViews() { return delay([...db.views].sort((a, b) => a.position - b.position)); },
    async saveView(v) {
      const i = db.views.findIndex((x) => x.id === v.id);
      if (i >= 0) db.views[i] = v; else db.views.push(v);
      commit(); return delay(v);
    },
    async deleteView(id) { db.views = db.views.filter((v) => v.id !== id); commit(); },

    async attachPaths(itemId, paths) {
      const it = find(itemId);
      const t = now();
      const refs: FileRef[] = paths.map((p) => {
        const name = p.split(/[\\/]/).pop() || p;
        return { id: uid(), itemId, provider: "local", uri: p, name, kind: kindFromName(name), size: null, mtime: null, createdAt: t };
      });
      it.files.push(...refs); it.updatedAt = t; commit();
      return delay(refs);
    },
    async detachFile(fileId) {
      db.items.forEach((it) => { it.files = it.files.filter((f) => f.id !== fileId); });
      blobs.delete(fileId);
      commit();
    },
    async importPaths(paths, t) {
      const kind = t?.kind, list = t?.list;
      const created: Item[] = [];
      for (const p of paths) {
        const name = p.split(/[\\/]/).pop() || p;
        const fk = kindFromName(name);
        const guess: Kind = fk === "video" ? "movie" : fk === "archive" || fk === "document" ? "doujin" : fk === "image" ? "illust" : "other";
        const it = insert({ title: name.replace(/\.[^.]+$/, ""), kind: kind ?? guess, archiveId: t?.archiveId, list, coverUri: svgCover(db.items.length, name) });
        await api.attachPaths(it.id, [p]);
        created.push(find(it.id));
      }
      commit();
      return delay(created);
    },

    async importBlobs(files, t) {
      const kind = t?.kind, list = t?.list;
      const created: Item[] = [];
      for (const f of files) {
        const fk = kindFromName(f.name);
        const guess: Kind = fk === "archive" || fk === "document" ? "doujin" : fk === "image" ? "illust" : fk === "video" ? "movie" : fk === "audio" ? "music" : "other";
        const it = insert({ title: f.name.replace(/\.[^.]+$/, ""), kind: kind ?? guess, archiveId: t?.archiveId, list });
        const [ref] = await api.attachBlobs!(it.id, [f]);
        const fresh = find(it.id);
        fresh.coverUri = (ref.kind === "video" ? await videoPoster(f) : await firstPageDataUrl(ref.id)) ?? svgCover(db.items.length, f.name);
        commit();
        created.push(fresh);
      }
      return delay(created);
    },
    async attachBlobs(itemId, files) {
      const it = find(itemId);
      const t = now();
      const refs = files.map((f) => {
        const ref: FileRef = { id: uid(), itemId, provider: "local", uri: `(업로드) ${f.name}`, name: f.name, kind: kindFromName(f.name), size: f.size, mtime: f.lastModified, createdAt: t };
        blobs.set(ref.id, f);
        return ref;
      });
      it.files.push(...refs); commit();
      return delay(refs);
    },

    async searchMetadata(kind, query) {
      const bare = /^\s*#?(\d{7})\s*$/.exec(query)?.[1];
      if (bare) return [await hitomiGallery(bare)];
      if (/^https?:\/\//i.test(query)) {
        const hitomi = /hitomi\.la\/[a-z]+\/(?:[^/?#]*-)?(\d+)\.html/i.exec(query)?.[1];
        if (hitomi) return [await hitomiGallery(hitomi)];
        // a song (song archive / YouTube Music link) links to YouTube Music; anything else stays a video
        if (youtubeId(query)) {
          const c = kind === "music" || /music\.youtube\.com/.test(query) ? await youtubeSong(query) : await youtubeVideo(query);
          if (c) return [c];
        }
        // other pages can't be read from a browser (cross-site): keep the link with a name from its address
        if (!kindFromLink(query)) return [];
        let name = query;
        try {
          const u = new URL(query);
          const last = decodeURIComponent(u.pathname.split("/").filter(Boolean).pop() ?? "").replace(/\.\w{2,5}$/, "");
          // "watch", "index", "view", numbers… say nothing: use the site's name instead
          name = last && !/^(watch|index|view|read|post|posts|p|item|items|detail|list|show|page|article|board|status|\d+)$/i.test(last) ? last.replace(/[-_]/g, " ") : u.hostname.replace(/^www\./, "");
        } catch { /* keep */ }
        return [{ provider: "web", id: query, title: name, altTitles: [], kind, year: null, coverUrl: null, bannerUrl: null,
          summary: null, people: [], genres: [], series: null, url: query, code: null, detail: null }];
      }
      if (kind === "doujin") return [];
      // songs: YouTube Music first (through the site's relay), Apple Music when it is not there
      if (kind === "music") {
        for (const find of [ytmSearch, ytApiSearch, itunesSearch]) { const hits = await find(query).catch(() => []); if (hits.length) return hits; }
      }
      if (/youtu\.?be|music\.youtube|steampowered|play\.google/.test(query) || kind === "game" || kind === "music" || kind === "catalog" || kind === "movie" || kind === "illust" || kind === "other") {
        throw new Error("웹에서는 AniList만 검색돼요");
      }
      try {
        return await searchAniList(kind, query);
      } catch {
        // Offline / sandboxed preview: show example hits so the screen can still be reviewed.
        return [0, 1, 2].map((i): Candidate => ({
          provider: ["anilist", "wikipedia", "naver"][i], id: `demo-${i}`, title: i ? `${query} (${["", "원작", "외전"][i]})` : query,
          altTitles: ["예시 결과 · 실제 앱에서는 온라인 검색"], kind, year: 2023 - i, coverUrl: svgCover(i + 3, query), bannerUrl: svgCover(i + 5, query, 1200, 400),
          summary: "미리보기 환경에서는 외부 사이트 접속이 막혀 있어 예시 결과를 보여드려요. 데스크톱 앱에서는 AniList·Steam·Google Play·네이버·위키백과·YouTube를 동시에 검색해요.",
          people: [{ name: "예시 작가", category: "author", role: null }, { name: "예시 스튜디오", category: "studio", role: null }], genres: ["판타지", "모험"], series: null, url: null, code: null,
        }));
      }
    },
    async applyMetadata(itemId, c0, overwriteTitle) {
      const it = find(itemId);
      // a YouTube Music search hit: fetch the song's full details (year, album, genre…), like the desktop
      let c = c0;
      if (c.provider === "youtube" && c.year == null && c.url) {
        const full = await youtubeSong(c.url).catch(() => null);
        // the full details' square album art beats the search result's video still
        if (full) c = { ...full, title: c.title || full.title, coverUrl: full.coverUrl ?? c.coverUrl, people: c.people.length ? c.people : full.people, extra: { ...full.extra, ...c.extra } };
      }
      if (overwriteTitle || it.title === "제목 없음") it.title = c.title;
      it.coverUri = c.coverUrl ?? it.coverUri;
      it.bannerUri = c.bannerUrl ?? it.bannerUri;
      it.summary = c.summary ?? it.summary;
      it.year = c.year ?? it.year;
      // a song found from its YouTube link links to YouTube Music instead
      // …and a stand-in link (a YouTube Music search, an old Apple Music page) gives way to the song's own
      const standIn = !!it.url && (/music\.youtube\.com\/search\?|music\.apple\.com/.test(it.url));
      if (!it.url || standIn || (c.url?.includes("music.youtube.com") && youtubeId(it.url) === youtubeId(c.url))) it.url = c.url ?? it.url;
      it.source = { provider: c.provider, id: c.id, url: c.url, altTitles: c.altTitles };
      const add = (n: string, cat: TagCategory) => { const t = upsertTag(n, cat); if (!it.tags.some((x) => x.id === t.id)) it.tags.push(t); };
      c.people.forEach((p) => add(p.name, p.category));
      c.genres.forEach((g) => add(g, "genre"));
      if (c.series) add(c.series, "series");
      if (it.kind === "other" && c.kind === "music") it.kind = "music";
      if (c.extra && Object.keys(c.extra).length) it.props = { ...it.props, _extra: { ...((it.props?._extra as object) ?? {}), ...c.extra } };
      it.updatedAt = now(); commit();
      return delay(it);
    },
    // preview: no Google sign-in in the browser sandbox
    async driveStatus() { return { available: false, builtin: false, connected: false, email: null }; },
    async driveLogin() { throw new Error("미리보기에서는 구글 계정을 연결할 수 없어요. 데스크톱 앱에서 연결해 주세요."); },
    async driveLogout() { return { available: false, builtin: false, connected: false, email: null }; },
    async driveFolder() { throw new Error("미리보기에서는 드라이브를 열 수 없어요"); },
    async driveImport() { throw new Error("미리보기에서는 드라이브를 열 수 없어요"); },
    async driveSync() { throw new Error("미리보기에서는 동기화할 수 없어요"); },
    async fetchLyrics(itemId) {
      // web: LRCLIB straight from the browser (the desktop app reads YouTube Music's own lyrics first)
      const it = find(itemId);
      const authors = it.tags.filter((t) => t.category === "author").map((t) => t.name);
      const ex = (it.props?._extra ?? {}) as Record<string, string>;
      // what the song is: its title spellings, who sang it first (a cover's original singer), its length
      let title = it.title;
      const alts = [...(ex.alt_titles ?? "").split("|"), ...((it.source?.altTitles as string[] | undefined) ?? [])].map((x) => x.trim()).filter(Boolean);
      let artists = [...(ex.original_artist ?? "").split(",").map((x) => x.trim()).filter(Boolean), ...authors];
      for (const raw of [it.title, ...alts]) {
        const c = parseCover(raw, authors[0] ?? "");
        if (!c) continue;
        if (raw === it.title) title = c.title; else alts.push(c.title);
        alts.push(...c.alts);
        artists = [...c.artists, ...artists];
      }
      const len = /^(\d+):(\d{2})$/.exec(ex.duration ?? "");
      const secs = len ? Number(len[1]) * 60 + Number(len[2]) : 0;
      const save = (l: { plain: string; synced: string; source: string }) => { it.props = { ...it.props, _lyrics: l }; commit(); return delay(it); };
      // the video's own lyrics (YouTube Music's 가사 tab) — exact, no guessing
      const vid = youtubeId(it.url ?? "");
      let untimed: { plain: string; synced: string; source: string } | null = null; // found, but without timing
      const take = (l: { plain: string; synced: string; source: string }) => { if (l.synced) return true; untimed ??= l; return false; };
      if (vid) { const own = await ytmLyrics(vid).catch(() => null); if (own && take(own)) return save(own); }
      // neither a singer nor a length: a title alone ("Watch", "Home"…) finds someone else's song
      if ((!artists.length && !secs) || !title.trim()) return untimed ? save(untimed) : null;
      const norm = (x: string) => x.toLowerCase().replace(/\(.*?\)|\[.*?\]/g, "").replace(/[\s\p{P}\p{S}]+/gu, "");
      const script = (x: string) => /[\p{Script=Hangul}\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/u.test(x);
      // YouTube Music first (through the site's relay): the video's own lyrics, then the song found by title
      if (!untimed) {
        search: for (const t of [...new Set([title, ...alts])]) {
          for (const v of await ytmFind({ title, alts, artists, duration: secs }, t).catch(() => [])) {
            if (v === vid) continue;
            const l = await ytmLyrics(v).catch(() => null);
            if (l && take(l)) return save(l);
            if (l) break search;
          }
        }
      }
      // lyrics without timing above: LRCLIB's timed lyrics of the same song follow the music instead
      type Hit = { trackName: string; artistName: string; duration?: number; plainLyrics?: string; syncedLyrics?: string; instrumental?: boolean };
      let h: Hit | undefined;
      for (const t of [...new Set([title, ...alts])]) {
        let hits: Hit[];
        try {
          hits = await (await fetch(`https://lrclib.net/api/search?q=${encodeURIComponent(`${t} ${artists[0] ?? ""}`.trim())}`, { signal: AbortSignal.timeout(10000) })).json();
        } catch { if (untimed) return save(untimed); throw new Error("가사 사이트에 접속할 수 없어요"); }
        const want = norm(t);
        const rank = (x: Hit) => {
          if (x.instrumental || !(norm(x.trackName) === want || (want.length >= 3 && norm(x.trackName).includes(want)))) return -1;
          // singer: same → yes; someone else → no; can't compare (아카네 리제 ↔ Orangestar) → identical title + length within 3 s
          if (artists.some((a) => sameText(x.artistName, a))) return 0;
          const someoneElse = artists.length > 0 && artists.every((a) => script(a) === script(x.artistName));
          const lenOk = !!secs && !!x.duration && Math.abs(x.duration - secs) <= 3;
          return !someoneElse && norm(x.trackName) === want && lenOk ? 1 : -1;
        };
        const ok = hits.map((x) => [rank(x), x] as const).filter(([r]) => r >= 0).sort((a, b) => a[0] - b[0] || Number(!a[1].syncedLyrics) - Number(!b[1].syncedLyrics));
        if (ok.length) { h = ok[0][1]; break; }
      }
      if (!h || (untimed && !h.syncedLyrics)) return untimed ? save(untimed) : null;
      const synced = h.syncedLyrics ?? "";
      it.props = { ...it.props, _lyrics: { plain: h.plainLyrics || synced.replace(/^\s*(\[[0-9:.]+\]\s*)+/gm, ""), synced, source: "LRCLIB" } };
      commit();
      return delay(it);
    },
    async autofill(itemId) {
      const it = find(itemId);
      // the people already written down (the singer in a pasted list) narrow the search
      const authors = it.tags.filter((t) => t.category === "author").map((t) => t.name);
      const query = it.url ?? (it.kind === "music" && authors[0] ? `${it.title} ${authors[0]}` : it.title);
      try {
        const hits: Candidate[] = (await api.searchMetadata(it.kind, query)).filter((h) => it.url || sameText(h.title, it.title) || h.altTitles.some((a) => sameText(a, it.title)));
        // same person first; a hit by someone else only is another work with the same title
        const verdict = (h: Candidate) => {
          const theirs = h.people.filter((p) => ["author", "circle", "studio"].includes(p.category)).map((p) => p.name);
          if (!authors.length || !theirs.length) return null;
          if (authors.some((a) => theirs.some((t) => sameText(a, t)))) return true;
          const script = (x: string) => /[\p{Script=Hangul}\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/u.test(x);
          return authors.some((a) => theirs.some((t) => script(a) !== script(t))) ? null : false; // 아이유 ↔ IU: can't tell
        };
        const best = it.url || !authors.length ? hits[0] : hits.find((h) => verdict(h) === true) ?? hits.find((h) => verdict(h) === null);
        if (!best) return false;
        // typed "supernova", found "Supernova": keep the official spelling (only case / spaces / punctuation differ)
        const key = (x: string) => x.toLowerCase().replace(/[\s\p{P}\p{S}]+/gu, "");
        await api.applyMetadata(itemId, best, best.title !== it.title && key(best.title) === key(it.title));
        return true;
      } catch { return false; }
    },

    async listPages(f) {
      await blobs.ready;
      const blob = blobs.get(f.id);
      if (!blob) {
        // sample data: no real file behind it → show the item's cover so the reader is not empty
        const cover = db.items.find((x) => x.id === f.itemId)?.coverUri;
        if (!cover) throw new Error("미리보기 예시 파일이라 내용이 없어요. 직접 올린 파일은 열 수 있어요.");
        pageCache.set(f.id, { names: [f.name], urls: [cover] });
        return [f.name];
      }
      const cached = pageCache.get(f.id);
      if (cached) return cached.names;
      if (IMG_RE.test(f.name)) {
        pageCache.set(f.id, { names: [f.name], urls: [URL.createObjectURL(blob)] });
        return [f.name];
      }
      if (isAniName(f.name)) { // animated cursor → first frame (the reader plays the whole thing)
        pageCache.set(f.id, { names: [f.name], urls: [parseAni(await blob.arrayBuffer()).frames[0]] });
        return [f.name];
      }
      const entries = unzipSync(new Uint8Array(await blob.arrayBuffer()), { filter: (e) => IMG_RE.test(e.name) && !e.name.startsWith("__MACOSX") && !/(^|\/)\._/.test(e.name) });
      const names = Object.keys(entries).sort(natural);
      const urls = names.map((n) => URL.createObjectURL(new Blob([entries[n]], { type: imageMime(n) })));
      pageCache.set(f.id, { names, urls });
      return names;
    },
    pageUrl: (f, i) => pageCache.get(f.id)?.urls[i] ?? "",
    fileUrl: (f) => {
      const b = blobs.get(f.id);
      return b ? URL.createObjectURL(b) : null;
    },
    async readText(f) {
      await blobs.ready;
      const b = blobs.get(f.id);
      if (!b) throw new Error("미리보기 예시 파일이라 내용이 없어요. 직접 올린 파일은 열 수 있어요.");
      return await b.text();
    },
    async writeText(f, content) {
      const b = blobs.get(f.id);
      if (!b) throw new Error("미리보기 예시 파일은 수정할 수 없어요. 직접 올린 파일은 돼요.");
      const nf = new File([content], f.name, { type: b.type || "text/plain" });
      blobs.set(f.id, nf);
      const it = find(f.itemId);
      const ref = it.files.find((x) => x.id === f.id)!;
      ref.size = nf.size; ref.mtime = Date.now(); commit();
      return clone(ref);
    },
    async downloadFile(f) {
      const b = blobs.get(f.id);
      if (!b) throw new Error("미리보기 예시 파일은 내려받을 수 없어요. 직접 올린 파일은 돼요.");
      const a = Object.assign(document.createElement("a"), { href: URL.createObjectURL(b), download: f.name });
      document.body.appendChild(a); a.click(); a.remove();
    },

    async listWatchFolders() { return delay(db.watch); },
    async addWatchFolder(path, kind, list) {
      const w: WatchFolder = { id: uid(), path, kind, list, lastScan: null };
      db.watch.push(w); commit(); return delay(w);
    },
    async removeWatchFolder(id) { db.watch = db.watch.filter((w) => w.id !== id); commit(); },
    async rescan() { return 0; },
    onLibraryChanged: () => () => {},

    async openFile() { throw new Error("미리보기에서는 파일을 열 수 없어요 — 데스크톱 앱에서 동작해요"); },
    async revealFile() { throw new Error("미리보기에서는 폴더를 열 수 없어요 — 데스크톱 앱에서 동작해요"); },
    async pickPaths() {
      useAppError("미리보기에서는 파일 선택창 대신 '파일 올리기'나 끌어다 놓기를 써 주세요");
      return null;
    },
    mediaUrl: (uri) => uri ?? null,
  };

  /** A frame 10% into an uploaded video (same thing the desktop app does with ffmpeg). */
  function videoPoster(f: File): Promise<string | null> {
    return new Promise((res) => {
      const v = document.createElement("video");
      const url = URL.createObjectURL(f);
      const done = (r: string | null) => { URL.revokeObjectURL(url); res(r); };
      const timer = setTimeout(() => done(null), 8000);
      v.muted = true; v.preload = "auto";
      v.onloadedmetadata = () => { v.currentTime = Math.min(90, (v.duration || 0) * 0.1); };
      v.onseeked = () => {
        clearTimeout(timer);
        try {
          const k = Math.min(1, 720 / (v.videoWidth || 720));
          const c = Object.assign(document.createElement("canvas"), { width: Math.round(v.videoWidth * k), height: Math.round(v.videoHeight * k) });
          c.getContext("2d")!.drawImage(v, 0, 0, c.width, c.height);
          done(c.width ? c.toDataURL("image/jpeg", 0.85) : null);
        } catch { done(null); }
      };
      v.onerror = () => { clearTimeout(timer); done(null); };
      v.src = url;
    });
  }

  async function firstPageDataUrl(fileId: ID): Promise<string | null> {
    const f = db.items.flatMap((i) => i.files).find((x) => x.id === fileId);
    if (!f || f.kind === "document") return null;
    try {
      const names = await api.listPages(f);
      if (!names.length) return null;
      const blob = await (await fetch(api.pageUrl(f, 0))).blob();
      return await new Promise<string | null>((res) => {
        const img = new Image();
        img.onerror = () => res(null); // broken image → fall back to a generated cover
        setTimeout(() => res(null), 8000);
        img.onload = () => {
          // tiny pictures (cursors, icons, pixel art) are enlarged with sharp pixels and keep transparency
          const tiny = img.width < 128;
          const scale = tiny ? Math.floor(256 / Math.max(1, img.width)) || 1 : Math.min(1, 480 / img.width);
          const c = document.createElement("canvas");
          c.width = img.width * scale; c.height = img.height * scale;
          const g = c.getContext("2d")!;
          g.imageSmoothingEnabled = !tiny;
          g.drawImage(img, 0, 0, c.width, c.height);
          res(tiny ? c.toDataURL("image/png") : c.toDataURL("image/jpeg", 0.85));
        };
        img.src = URL.createObjectURL(blob);
      });
    } catch { return null; }
  }

  return api;
}
