import { archiveKind, cloudProps, FLAG, isCloudSynced, isMainKind, isSong } from "@/lib/itemFlags";
import { particle } from "@/lib/josa";
import { autoCovers } from "@/lib/autoCover";
import { create } from "zustand";
import { api } from "@/api";
import type {
  Archive, ArchiveCount, Candidate, Category, FieldDef, FileRef, ID, ImportTarget, Item, ItemPatch, ItemQuery, NewItem, StatusDef, Tag,
  TagCategory, View,
} from "@/api/types";
import { DEFAULT_VIEWS, archiveViews } from "@/lib/defaults";
import { extraPatch, useProps } from "@/lib/properties";
import { uid } from "@/lib/format";
import { isViewable } from "@/components/viewer/files";
import { isReadable } from "@/components/reader/source";

export type Dialog =
  | null
  | { type: "metadata"; itemId: ID }
  | { type: "import" }
  | { type: "link" }
  | { type: "archive"; archiveId: ID | null }
  | { type: "deleteArchive"; archiveId: ID }
  | { type: "videoCover"; itemId: ID; fileId: ID };

/** Right-click menu target. */
export type ContextMenu = null | { x: number; y: number; target: { type: "archive"; id: ID } | { type: "view"; id: ID } | { type: "item"; id: ID } | { type: "folder"; id: ID } | { type: "all" } };

interface AppState {
  ready: boolean;
  error: string | null;
  toast: string | null;
  /** Optional button on the toast (e.g. 되돌리기 after moving to the trash). */
  toastAction: { label: string; run: () => void } | null;
  trashCount: number;
  items: Item[];
  counts: ArchiveCount[];
  archives: Archive[];
  /** Archives kept out of the cloud copy as a whole (Settings "cloud".offArchives). */
  cloudOff: ID[];
  setArchiveCloud(id: ID, on: boolean): Promise<void>;
  /** Cloud switch of every item a query finds (a folder's items, or all of them). */
  setItemsCloud(q: ItemQuery, on: boolean, label: string): Promise<void>;
  statuses: StatusDef[];
  /** Archives whose wishlist row is folded in the sidebar. */
  folded: Set<ID>;
  menu: ContextMenu;
  tags: Tag[];
  fields: FieldDef[];
  views: View[];
  categories: Category[];
  activeViewId: ID;
  /** Selected folder in the category tree (UI state, not saved in the view). */
  categoryId: ID | null;
  /** What was clicked last — F2 renames that (a folder in the panel, or the open item). */
  lastPicked: "item" | "folder" | null;
  /** A folder whose name box should open (F2); the folder panel takes it and clears it. */
  renameFolderId: ID | null;
  showCategories: boolean;
  search: string;
  selectedId: ID | null;
  detail: Item | null;
  sidebarExpanded: boolean;
  /** Item panel covers the whole content area (sidebar + toolbar stay). */
  detailFull: boolean;
  /** Phone/tablet: sidebar shown as a drawer over the page. */
  drawerOpen: boolean;
  /** Phone/tablet: category tree shown as a drawer. */
  catDrawer: boolean;
  settingsOpen: boolean;
  dialog: Dialog;
  reader: { item: Item; file: FileRef } | null;
  /** Video / audio / text viewer */
  viewer: { item: Item; file: FileRef } | null;

  init(): Promise<void>;
  refresh(): Promise<void>;
  reloadAll(): Promise<void>;
  setSearch(s: string): void;
  setView(id: ID): void;
  patchView(patch: Partial<View>): void;
  createView(): Promise<void>;
  deleteView(id: ID): Promise<void>;

  select(id: ID | null): Promise<void>;
  /** Items opened through links; the detail header's back arrow walks this. */
  linkBack: ID[];
  openLinked(id: ID): Promise<void>;
  linkGoBack(): Promise<void>;
  createItem(input: NewItem): Promise<Item>;
  updateItem(id: ID, patch: ItemPatch): Promise<void>;
  deleteItem(id: ID): Promise<void>;
  importPaths(paths: string[]): Promise<void>;
  importBlobs(files: File[]): Promise<void>;
  /** Browser folder pick (files with relative paths): one item per folder. */
  importFolders(files: File[]): Promise<void>;
  saveArchive(a: Archive): Promise<void>;
  createArchive(name: string, icon: string): Promise<Archive>;
  deleteArchive(id: ID): Promise<void>;
  toggleFold(id: ID): void;
  reorderArchives(ids: ID[]): Promise<void>;
  saveStatus(d: StatusDef): Promise<void>;
  deleteStatus(id: string, fallback: string): Promise<void>;
  openMenu(m: ContextMenu): void;
  /** Show/hide/add detail-panel properties for an archive (saved in its view). */
  setPropLayout(archiveId: ID | null, patch: { hidden?: string[]; extra?: string[]; names?: Record<string, string> }): void;
  attachPaths(itemId: ID, paths: string[]): Promise<FileRef[]>;
  attachBlobs(itemId: ID, files: File[]): Promise<FileRef[]>;
  detachFile(itemId: ID, fileId: ID): Promise<void>;
  bulkCreate(inputs: NewItem[]): Promise<ID[]>;

  applyMetadata(itemId: ID, c: Candidate, overwriteTitle: boolean): Promise<void>;
  /** Lyrics for a song item; `quiet` = no toast when nothing is found (automatic lookups). */
  fetchLyrics(itemId: ID, quiet?: boolean): Promise<boolean>;
  autofill(itemIds: ID[], onProgress?: (done: number, hit: number) => void): Promise<number>;

  ensureTag(name: string, category: TagCategory): Promise<Tag>;
  saveField(f: FieldDef): Promise<void>;
  deleteField(id: ID): Promise<void>;

  setCategory(id: ID | null): void;
  toggleCategories(): void;
  addCategory(name: string, parentId: ID | null, archiveId: ID | null): Promise<Category>;
  /** Move a folder (with its sub-folders) under another folder and/or into another archive. */
  moveCategory(id: ID, parentId: ID | null, archiveId: ID | null): Promise<void>;
  /** Put a folder right before / after another one (same parent, same archive), renumbering that level. */
  placeCategory(id: ID, targetId: ID, where: "before" | "after"): Promise<void>;
  /** Move items into an archive (dropped on it in the folder panel). */
  moveToArchive(itemIds: ID[], archiveId: ID): Promise<void>;
  saveCategory(c: Category): Promise<void>;
  deleteCategory(id: ID): Promise<void>;
  addToCategory(itemIds: ID[], categoryId: ID): Promise<void>;

  openReader(item: Item, file: FileRef): void;
  closeReader(): void;
  setDialog(d: Dialog): void;
  notify(msg: string, action?: { label: string; run: () => void }): void;
  restoreItem(id: ID): Promise<void>;
  /** Bring back a deleted archive / folder ("arc:<id>" / "cat:<id>") with everything that went with it. */
  restoreGroup(id: string): Promise<void>;
  purgeGroup(id: string): Promise<void>;
  purgeItem(id: ID): Promise<void>;
  emptyTrash(): Promise<void>;
  toggleSidebar(): void;
  toggleDetailFull(): void;
  setDrawer(v: boolean): void;
  setCatDrawer(v: boolean): void;
  setSettingsOpen(v: boolean): void;
}

const LS_SIDEBAR = "curio.sidebar";
const LS_VIEW = "curio.view";
const LS_CATS = "curio.showCategories";
const lsGet = (k: string) => { try { return localStorage.getItem(k); } catch { return null; } };
const lsSet = (k: string, v: string) => { try { localStorage.setItem(k, v); } catch { /* ignore */ } };

let viewSaveTimer: ReturnType<typeof setTimeout> | undefined;
let toastTimer: ReturnType<typeof setTimeout> | undefined;
let refreshSeq = 0;

export const activeView = (s: Pick<AppState, "views" | "activeViewId">): View =>
  s.views.find((v) => v.id === s.activeViewId) ?? s.views[0] ?? DEFAULT_VIEWS[0];

/** archive / kind / list implied by the current view (defaults for new items and imports). */
export const viewContext = (v: View): ImportTarget => {
  const a = v.query.archiveId ? useApp.getState().archives.find((x) => x.id === v.query.archiveId) : undefined;
  return {
    archiveId: a?.id,
    kind: a ? archiveKind(a) : (v.query.kinds?.length === 1 ? v.query.kinds[0] : undefined),
    list: v.query.list,
  };
};

const LS_FOLD = "curio.folded";

export const useApp = create<AppState>((set, get) => {
  void import("@/api/adapters/mock").then((m) => m.setMockErrorSink((error) => set({ error })));
  /** Apply a function to an item everywhere it is cached (list + open detail). */
  const mapItem = (id: ID, fn: (it: Item) => Item) =>
    set((s) => ({
      items: s.items.map((it) => (it.id === id ? fn(it) : it)),
      detail: s.detail?.id === id ? fn(s.detail) : s.detail,
    }));
  const fail = (e: unknown) => set({ error: e instanceof Error ? e.message : String(e) });
  /** An item made from one image / text / video file *is* that file (shown inline, not as an attachment). */
  const markMain = async (created: Item[]) => {
    for (const it of created) {
      const f = it.files.length === 1 ? it.files[0] : null;
      if (f && isMainKind(f)) await api.updateItem(it.id, { props: { ...it.props, [FLAG.main]: f.id } }).catch(() => undefined);
    }
  };
  /** Fill the items' empty user properties from the facts their source brought (see extraPatch). */
  const fillExtras = async (items: Item[]) => {
    for (const it of items) {
      const props = extraPatch(it);
      if (!props) continue;
      const saved = await api.updateItem(it.id, { props }).catch(() => null);
      if (saved) mapItem(it.id, () => saved);
    }
  };
  /** After a restore: archives / folders may have come back too. */
  const reloadContainers = () => get().reloadAll();
  const loadCloudOff = async () => {
    const cfg = (await api.getSettings<{ offArchives?: string[] }>("cloud").catch(() => null)) ?? {};
    set({ cloudOff: (cfg.offArchives ?? []).filter((x) => typeof x === "string") });
  };
  const reloadDetail = async () => {
    const id = get().selectedId;
    if (!id) return;
    const full = await api.getItem(id);
    if (get().selectedId === id) set({ detail: full });
  };

  return {
    ready: false,
    error: null,
    toast: null,
    toastAction: null,
    trashCount: 0,
    items: [],
    counts: [],
    archives: [],
    cloudOff: [],
    statuses: [],
    folded: new Set<ID>((() => { try { return JSON.parse(localStorage.getItem(LS_FOLD) ?? "[]") as ID[]; } catch { return []; } })()),
    menu: null,
    tags: [],
    fields: [],
    views: [],
    categories: [],
    activeViewId: lsGet(LS_VIEW) ?? "sys:all",
    categoryId: null,
    lastPicked: null,
    renameFolderId: null,
    showCategories: lsGet(LS_CATS) !== "0",
    search: "",
    selectedId: null,
    detail: null,
    sidebarExpanded: lsGet(LS_SIDEBAR) === "1",
    detailFull: lsGet("curio.detailFull") === "1",
    drawerOpen: false,
    catDrawer: false,
    settingsOpen: false,
    dialog: null,
    reader: null,
    viewer: null,

    async init() {
      try {
        let views = await api.listViews();
        const [archives, statuses] = await Promise.all([api.listArchives(), api.listStatuses()]);
        set({ archives, statuses });
        // Seed / repair built-in views and each archive's two views.
        const wanted = [...DEFAULT_VIEWS, ...archives.flatMap(archiveViews)];
        const missing = wanted.filter((d) => !views.some((v) => v.id === d.id));
        if (missing.length) {
          await Promise.all(missing.map((v) => api.saveView(v)));
          views = await api.listViews();
        }
        const [tags, fields, categories] = await Promise.all([api.listTags(), api.listFields(), api.listCategories()]);
        set({ fields });
        await useProps.getState().load();
        const activeViewId = views.some((v) => v.id === get().activeViewId) ? get().activeViewId : views[0].id;
        set({ views, tags, fields, categories, activeViewId });
        await loadCloudOff();
        await get().refresh();
        set({ ready: true });
        api.onLibraryChanged(() => void get().reloadAll()); // archives, folders, views may have changed too
      } catch (e) {
        fail(e);
        set({ ready: true });
      }
    },

    /** Re-read everything (after another device's changes arrived through sync). */
    async setArchiveCloud(id, on) {
      const cfg = ((await api.getSettings<Record<string, unknown>>("cloud")) ?? {}) as { offArchives?: string[] };
      const offArchives = [...new Set((cfg.offArchives ?? []).filter((x) => x !== id).concat(on ? [] : [id]))];
      await api.setSettings("cloud", { ...cfg, offArchives });
      set({ cloudOff: offArchives });
      const name = get().archives.find((a) => a.id === id)?.name ?? "";
      get().notify(on ? `"${name}" 동기화를 켰어요` : `"${name}"${particle(name, "은/는")} 이 기기에만 둬요`);
    },
    async setItemsCloud(q, on, label) {
      const items = await api.listItems(q);
      const change = items.filter((it) => isCloudSynced(it) !== on);
      await Promise.all(change.map((it) => api.updateItem(it.id, { props: cloudProps(it, on) })));
      await get().refresh();
      await reloadDetail();
      get().notify(`${label} 항목 ${items.length}개 동기화를 ${on ? "켰어요" : "껐어요"}`);
    },

    async reloadAll() {
      const [archives, statuses, tags, fields, categories] = await Promise.all([
        api.listArchives(), api.listStatuses(), api.listTags(), api.listFields(), api.listCategories(),
      ]);
      // views of built-ins / archives another device does not have yet
      let views = await api.listViews();
      const missing = [...DEFAULT_VIEWS, ...archives.flatMap(archiveViews)].filter((d) => !views.some((v) => v.id === d.id));
      if (missing.length) { await Promise.all(missing.map((v) => api.saveView(v))); views = await api.listViews(); }
      const activeViewId = views.some((v) => v.id === get().activeViewId) ? get().activeViewId : views[0]?.id ?? get().activeViewId;
      set({ views, archives, statuses, tags, fields, categories, activeViewId });
      await loadCloudOff();
      await useProps.getState().load();
      await get().refresh();
      const id = get().selectedId;
      if (id) { const d = await api.getItem(id).catch(() => null); set(d ? { detail: d } : { detail: null, selectedId: null }); }
    },

    async refresh() {
      const seq = ++refreshSeq;
      const v = activeView(get());
      const search = get().search.trim();
      const [items, counts, trashCount] = await Promise.all([
        api.listItems({ ...v.query, search: search || undefined, categoryId: get().categoryId ?? undefined }),
        api.counts(),
        api.trashCount(),
      ]);
      if (seq === refreshSeq) set({ items, counts, trashCount }); // drop stale responses
    },

    setSearch(search) {
      set({ search });
      void get().refresh();
    },

    setView(id) {
      lsSet(LS_VIEW, id);
      set({ activeViewId: id, categoryId: null, drawerOpen: false });
      void get().refresh();
    },

    patchView(patch) {
      const cur = activeView(get());
      const next = { ...cur, ...patch };
      set((s) => ({ views: s.views.map((v) => (v.id === cur.id ? next : v)) }));
      if (patch.query) void get().refresh();
      clearTimeout(viewSaveTimer);
      viewSaveTimer = setTimeout(() => void api.saveView(next), 400);
    },

    async createView() {
      const cur = activeView(get());
      const v: View = { ...cur, id: `view:${uid()}`, name: "새 보기", icon: "bookmark", position: get().views.length + 100 };
      await api.saveView(v);
      set((s) => ({ views: [...s.views, v] }));
      get().setView(v.id);
    },

    async deleteView(id) {
      if (id.startsWith("sys:")) return;
      await api.deleteView(id);
      set((s) => ({ views: s.views.filter((v) => v.id !== id) }));
      if (get().activeViewId === id) get().setView("sys:all");
    },

    async select(id) {
      set({ selectedId: id, detail: id ? get().items.find((i) => i.id === id) ?? null : null, linkBack: [], ...(id ? { lastPicked: "item" as const } : {}) });
      if (id) await reloadDetail();
      const d = get().detail;
      if (d && d.id === id) { await fillExtras([d]); if (get().selectedId === id) await reloadDetail(); }
      // web: a song linked to a YouTube Music *search* gets its own address (with a YouTube key)
      if (d && api.caps.platform === "web" && /music\.youtube\.com\/search\?/.test(d.url ?? "")) {
        const artist = d.tags.find((t) => t.category === "author")?.name ?? "";
        void import("@/lib/ytApi").then((y) => y.resolveSongLink(d.title, artist)).then((url) => { if (url) void get().updateItem(d.id, { url }); });
      }
      // items added in the background (watched folders) may still lack a cover: make one now
      if (id) void autoCovers([id], (i, coverUri) => get().updateItem(i, { coverUri }));
    },
    linkBack: [],
    async openLinked(id) {
      const from = get().selectedId;
      set({ selectedId: id, detail: get().items.find((i) => i.id === id) ?? null, linkBack: from ? [...get().linkBack, from] : get().linkBack });
      await reloadDetail();
    },
    async linkGoBack() {
      const back = [...get().linkBack];
      const id = back.pop();
      if (!id) return;
      set({ selectedId: id, detail: get().items.find((i) => i.id === id) ?? null, linkBack: back });
      await reloadDetail();
    },

    async createItem(input) {
      const ctx = viewContext(activeView(get()));
      const cat = get().categoryId;
      const it = await api.createItem({
        kind: ctx.kind, archiveId: ctx.archiveId, list: ctx.list, categoryIds: cat ? [cat] : undefined, ...input,
      });
      await get().refresh();
      await get().select(it.id);
      return it;
    },

    async updateItem(id, patch) {
      // Optimistic: reflect immediately, reconcile with server response.
      const { tagIds, ...rest } = patch;
      const tags = get().tags;
      mapItem(id, (it) => ({
        ...it,
        ...rest,
        tags: tagIds ? (tagIds.map((t) => tags.find((x) => x.id === t)).filter(Boolean) as Tag[]) : it.tags,
      }));
      try {
        const saved = await api.updateItem(id, patch);
        mapItem(id, (it) => ({ ...saved, blocks: saved.blocks ?? it.blocks }));
        if (patch.list || patch.kind || patch.archiveId || patch.pinned !== undefined) void get().refresh();
      } catch (e) {
        fail(e);
        const fresh = await api.getItem(id);
        mapItem(id, () => fresh);
      }
    },

    async deleteItem(id) {
      const title = (get().items.find((i) => i.id === id) ?? get().detail)?.title;
      await api.deleteItem(id);
      set((s) => ({
        items: s.items.filter((i) => i.id !== id),
        selectedId: s.selectedId === id ? null : s.selectedId,
        detail: s.detail?.id === id ? null : s.detail,
      }));
      void get().refresh();
      get().notify(title ? `"${title}"${particle(title, "을/를")} 휴지통으로 옮겼어요` : "휴지통으로 옮겼어요", { label: "되돌리기", run: () => void get().restoreItem(id) });
    },

    async restoreItem(id) {
      try { await api.restoreItem(id); await reloadContainers(); get().notify("복원했어요"); } catch (e) { fail(e); }
    },
    async restoreGroup(id) {
      try { await api.restoreGroup(id); await reloadContainers(); get().notify("복원했어요"); } catch (e) { fail(e); }
    },
    async purgeGroup(id) { await api.purgeGroup(id); await get().refresh(); },
    async purgeItem(id) { await api.purgeItem(id); await get().refresh(); },
    async emptyTrash() { const n = await api.emptyTrash(); await get().refresh(); get().notify(`${n}개를 영구 삭제했어요`); },

    async importPaths(paths) {
      if (!paths.length) return;
      const ctx = viewContext(activeView(get()));
      try {
        const created = await api.importPaths(paths, ctx);
        await markMain(created);
        void autoCovers(created.map((c) => c.id), (id, coverUri) => get().updateItem(id, { coverUri }));
        const cat = get().categoryId;
        if (cat && created.length) await api.addToCategory(created.map((c) => c.id), cat);
        set({ tags: await api.listTags() });
        await get().refresh();
        if (created.length === 1) await get().select(created[0].id);
        get().notify(`${created.length}개 항목을 추가했어요`);
      } catch (e) { fail(e); }
    },

    async importBlobs(files) {
      if (!files.length || !api.importBlobs) return;
      const ctx = viewContext(activeView(get()));
      try {
        const created = await api.importBlobs(files, ctx);
        await markMain(created);
        void autoCovers(created.map((c) => c.id), (id, coverUri) => get().updateItem(id, { coverUri }));
        const cat = get().categoryId;
        if (cat && created.length) await api.addToCategory(created.map((c) => c.id), cat);
        await get().refresh();
        if (created.length === 1) await get().select(created[0].id);
        get().notify(`${created.length}개 파일을 올렸어요`);
      } catch (e) { fail(e); }
    },

    async attachPaths(itemId, paths) {
      const refs = await api.attachPaths(itemId, paths);
      mapItem(itemId, (it) => ({ ...it, files: [...it.files, ...refs] }));
      void autoCovers([itemId], (id, coverUri) => get().updateItem(id, { coverUri }));
      return refs;
    },

    async attachBlobs(itemId, files) {
      if (!api.attachBlobs) return [];
      const refs = await api.attachBlobs(itemId, files);
      mapItem(itemId, (it) => ({ ...it, files: [...it.files, ...refs] }));
      void autoCovers([itemId], (id, coverUri) => get().updateItem(id, { coverUri }));
      return refs;
    },

    async importFolders(files) {
      // browser folder pick: files carry "Folder/sub/file" paths → one item per top folder
      const groups = new Map<string, File[]>();
      for (const f of files) {
        const rel = (f as File & { webkitRelativePath?: string }).webkitRelativePath || f.name;
        const top = rel.includes("/") ? rel.split("/")[0] : f.name;
        if (rel.split("/").some((p) => p.startsWith("."))) continue; // hidden files (.DS_Store…)
        groups.set(top, [...(groups.get(top) ?? []), f]);
      }
      if (!groups.size || !api.attachBlobs) return;
      const ids: string[] = [];
      for (const [name, list] of groups) {
        const it = await get().createItem({ title: name });
        const sorted = [...list].sort((a, b) => ((a as File & { webkitRelativePath?: string }).webkitRelativePath ?? a.name).localeCompare((b as File & { webkitRelativePath?: string }).webkitRelativePath ?? b.name, undefined, { numeric: true }));
        await api.attachBlobs(it.id, sorted);
        ids.push(it.id);
      }
      await get().refresh();
      get().notify(`폴더 ${ids.length}개를 가져왔어요`);
      void autoCovers(ids, (id, coverUri) => get().updateItem(id, { coverUri }));
    },

    async detachFile(itemId, fileId) {
      await api.detachFile(fileId);
      mapItem(itemId, (it) => ({ ...it, files: it.files.filter((f) => f.id !== fileId) }));
    },

    async bulkCreate(inputs) {
      const ids = await api.bulkCreate(inputs);
      set({ tags: await api.listTags() });
      await get().refresh();
      return ids;
    },

    async applyMetadata(itemId, c, overwriteTitle) {
      const saved = await api.applyMetadata(itemId, c, overwriteTitle);
      mapItem(itemId, () => saved);
      await fillExtras([saved]);
      set({ tags: await api.listTags() });
      void get().refresh();
      // songs: look for lyrics in the background
      if ((isSong(saved, get().archives.find((a) => a.id === saved.archiveId)?.name) || c.kind === "music") && !saved.props?._lyrics) void get().fetchLyrics(itemId, true);
    },

    async fetchLyrics(itemId, quiet) {
      try {
        const it = await api.fetchLyrics(itemId);
        if (!it) { if (!quiet) get().notify("가사를 찾지 못했어요"); return false; }
        mapItem(itemId, () => it);
        if (!quiet) get().notify("가사를 불러왔어요");
        return true;
      } catch (e) {
        if (!quiet) fail(e);
        return false;
      }
    },

    async autofill(itemIds, onProgress) {
      let hit = 0;
      for (let i = 0; i < itemIds.length; i++) {
        try { if (await api.autofill(itemIds[i])) hit++; } catch { /* keep going */ }
        onProgress?.(i + 1, hit);
        // be polite to public APIs (AniList allows ~90 req/min)
        if (i < itemIds.length - 1) await new Promise((r) => setTimeout(r, 700));
      }
      await fillExtras(await Promise.all(itemIds.map((id) => api.getItem(id).catch(() => null))).then((l) => l.filter((x): x is Item => !!x)));
      set({ tags: await api.listTags() });
      await get().refresh();
      await reloadDetail();
      return hit;
    },

    async ensureTag(name, category) {
      const t = await api.upsertTag(name.trim(), category);
      if (!get().tags.some((x) => x.id === t.id)) set((s) => ({ tags: [...s.tags, t] }));
      return t;
    },

    async saveField(f) {
      await api.saveField(f);
      set((s) => {
        const exists = s.fields.some((x) => x.id === f.id);
        return { fields: exists ? s.fields.map((x) => (x.id === f.id ? f : x)) : [...s.fields, f] };
      });
    },

    async deleteField(id) {
      await api.deleteField(id);
      set((s) => ({ fields: s.fields.filter((f) => f.id !== id) }));
    },

    setCategory(categoryId) {
      set({ categoryId, catDrawer: false, lastPicked: categoryId ? "folder" : get().lastPicked });
      void get().refresh();
    },
    toggleCategories() {
      const v = !get().showCategories;
      lsSet(LS_CATS, v ? "1" : "0");
      set({ showCategories: v });
    },
    async addCategory(name, parentId, archiveId) {
      const parent = parentId ? get().categories.find((c) => c.id === parentId) : undefined;
      const arc = parent?.archiveId ?? archiveId;
      const siblings = get().categories.filter((c) => c.parentId === parentId && (parentId || c.archiveId === arc));
      const c: Category = { id: uid(), parentId, kind: null, name: name.trim() || "새 폴더", position: siblings.length, archiveId: arc };
      await api.saveCategory(c);
      set((s) => ({ categories: [...s.categories, c] }));
      return c;
    },
    async saveCategory(c) {
      try {
        await api.saveCategory(c);
        set((s) => ({ categories: s.categories.map((x) => (x.id === c.id ? c : x)) }));
      } catch (e) { fail(e); }
    },
    async deleteCategory(id) {
      const name = get().categories.find((c) => c.id === id)?.name ?? "";
      await api.deleteCategory(id);
      set({ categories: await api.listCategories() });
      if (get().categoryId && !get().categories.some((c) => c.id === get().categoryId)) set({ categoryId: null });
      const sel = get().selectedId;
      await get().refresh();
      if (sel && !get().items.some((i) => i.id === sel)) set({ selectedId: null, detail: null });
      get().notify(`"${name}" 폴더를 휴지통으로 옮겼어요`, { label: "되돌리기", run: () => void get().restoreGroup(`cat:${id}`) });
    },
    async moveCategory(id, parentId, archiveId) {
      const all = get().categories;
      const sub = new Set([id]);
      for (let grew = true; grew;) { grew = false; for (const c of all) if (c.parentId && sub.has(c.parentId) && !sub.has(c.id)) { sub.add(c.id); grew = true; } }
      if (parentId && sub.has(parentId)) return; // not into itself
      const next = all.map((c) => (c.id === id ? { ...c, parentId, archiveId } : sub.has(c.id) ? { ...c, archiveId } : c));
      try {
        await Promise.all(next.filter((c) => sub.has(c.id)).map((c) => api.saveCategory(c)));
        set({ categories: next });
      } catch (e) { fail(e); }
    },
    async placeCategory(id, targetId, where) {
      if (id === targetId) return;
      const t = get().categories.find((c) => c.id === targetId);
      if (!t) return;
      const me = get().categories.find((c) => c.id === id);
      if (!me) return;
      if (me.parentId !== t.parentId || (me.archiveId ?? null) !== (t.archiveId ?? null)) await get().moveCategory(id, t.parentId, t.archiveId ?? null);
      const level = get().categories
        .filter((c) => c.id !== id && c.parentId === t.parentId && (c.archiveId ?? null) === (t.archiveId ?? null))
        .sort((a, b) => a.position - b.position || a.name.localeCompare(b.name, "ko", { numeric: true }));
      const at = level.findIndex((c) => c.id === targetId) + (where === "after" ? 1 : 0);
      const moved = get().categories.find((c) => c.id === id)!;
      level.splice(at, 0, moved);
      const changed = level.map((c, i) => ({ ...c, position: i })).filter((c, i) => level[i].position !== i || c.id === id);
      try {
        await Promise.all(changed.map((c) => api.saveCategory(c)));
        const byId = new Map(changed.map((c) => [c.id, c]));
        set((s) => ({ categories: s.categories.map((c) => byId.get(c.id) ?? c) }));
      } catch (e) { fail(e); }
    },
    async moveToArchive(itemIds, archiveId) {
      const a = get().archives.find((x) => x.id === archiveId);
      if (!a) return;
      const ids = itemIds.filter((id) => (get().items.find((i) => i.id === id)?.archiveId ?? null) !== archiveId);
      if (!ids.length) return;
      await Promise.all(ids.map((id) => api.updateItem(id, { archiveId, kind: a.kind })));
      await get().refresh();
      get().notify(`${ids.length}개를 "${a.name}"${particle(a.name, "으로/로")} 옮겼어요`);
    },
    async addToCategory(itemIds, categoryId) {
      await api.addToCategory(itemIds, categoryId);
      for (const id of itemIds) mapItem(id, (it) => ({ ...it, categoryIds: it.categoryIds.includes(categoryId) ? it.categoryIds : [...it.categoryIds, categoryId] }));
      const name = get().categories.find((c) => c.id === categoryId)?.name;
      get().notify(`"${name}" 폴더에 넣었어요`);
    },

    async saveArchive(a) {
      await api.saveArchive(a);
      const archives = await api.listArchives();
      // keep the archive's view names/icons in sync
      const views = get().views.map((v) =>
        v.id === `arc:${a.id}` ? { ...v, name: a.name, icon: a.icon } : v.id === `arc:${a.id}:wish` ? { ...v, name: `${a.name} 위시리스트` } : v);
      views.filter((v) => v.id.startsWith(`arc:${a.id}`)).forEach((v) => void api.saveView(v));
      set({ archives, views });
    },
    async createArchive(name, icon) {
      const a: Archive = { id: uid(), name: name.trim() || "새 아카이브", icon, kind: "other", format: null, position: get().archives.length + 20, pinned: false };
      await api.saveArchive(a);
      const vs = archiveViews(a);
      await Promise.all(vs.map((v) => api.saveView(v)));
      set((s) => ({ archives: [...s.archives, a], views: [...s.views, ...vs] }));
      get().setView(vs[0].id);
      return a;
    },
    async deleteArchive(id) {
      const name = get().archives.find((a) => a.id === id)?.name ?? "";
      await api.deleteArchive(id);
      set((s) => ({ archives: s.archives.filter((a) => a.id !== id), views: s.views.filter((v) => !v.id.startsWith(`arc:${id}`)) }));
      if (get().activeViewId.startsWith(`arc:${id}`)) get().setView("sys:all"); else void get().refresh();
      const sel = get().selectedId;
      if (sel && get().detail?.archiveId === id) set({ selectedId: null, detail: null });
      get().notify(`"${name}"${particle(name, "을/를")} 휴지통으로 옮겼어요`, { label: "되돌리기", run: () => void get().restoreGroup(`arc:${id}`) });
    },
    async reorderArchives(ids) {
      const archives = ids.map((id, i) => ({ ...get().archives.find((a) => a.id === id)!, position: i }));
      set({ archives: [...archives].sort((a, b) => Number(b.pinned) - Number(a.pinned) || a.position - b.position) });
      await Promise.all(archives.map((a) => api.saveArchive(a)));
    },
    async saveStatus(d) {
      await api.saveStatus(d);
      set({ statuses: await api.listStatuses() });
    },
    async deleteStatus(id, fallback) {
      try {
        const n = await api.deleteStatus(id, fallback);
        set({ statuses: await api.listStatuses() });
        await get().refresh();
        if (n) get().notify(`항목 ${n}개의 상태를 바꿨어요`);
      } catch (e) { fail(e); }
    },
    toggleFold(id) {
      const f = new Set(get().folded);
      if (f.has(id)) f.delete(id); else f.add(id);
      lsSet(LS_FOLD, JSON.stringify([...f]));
      set({ folded: f });
    },
    openMenu(menu) { set({ menu }); },
    setPropLayout(archiveId, patch) {
      const id = archiveId ? `arc:${archiveId}` : "sys:all";
      const v = get().views.find((x) => x.id === id);
      if (!v) return;
      const next = { ...v, card: { ...v.card, props: { ...v.card.props, ...patch } } };
      set((s) => ({ views: s.views.map((x) => (x.id === id ? next : x)) }));
      void api.saveView(next);
    },

    openReader(item, file) {
      // web version: a PC file is fetched from Drive first (when it travels with the library)
      if (api.ensureFile) {
        const toast = setTimeout(() => get().notify("드라이브에서 파일을 받는 중…"), 400);
        void api.ensureFile(file).then(() => { clearTimeout(toast); open(); }, (e) => { clearTimeout(toast); fail(e); });
        return;
      }
      open();
      function open() {
      // one entry point for every file: reader (pdf/zip/images), viewer (video/audio/text), else the OS app
      if (isViewable(file)) set({ viewer: { item, file } });
      else if (isReadable(file)) set({ reader: { item, file } });
      else void api.openFile(file).catch(fail);
      }
    },
    closeReader() { set({ reader: null }); },
    setDialog(dialog) { set({ dialog }); },
    notify(toast, action) {
      clearTimeout(toastTimer);
      set({ toast, toastAction: action ?? null });
      toastTimer = setTimeout(() => set({ toast: null, toastAction: null }), action ? 6000 : 2600);
    },
    toggleDetailFull() {
      const v = !get().detailFull;
      lsSet("curio.detailFull", v ? "1" : "0");
      set({ detailFull: v });
    },
    setDrawer(drawerOpen) { set({ drawerOpen }); },
    setCatDrawer(catDrawer) { set({ catDrawer }); },
    toggleSidebar() {
      const v = !get().sidebarExpanded;
      lsSet(LS_SIDEBAR, v ? "1" : "0");
      set({ sidebarExpanded: v });
    },
    setSettingsOpen(settingsOpen) { set({ settingsOpen }); },
  };
});
