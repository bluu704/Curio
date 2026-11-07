import { FLAG, isMainKind } from "@/lib/itemFlags";
import { create } from "zustand";
import { api } from "@/api";
import type {
  Archive, ArchiveCount, Candidate, Category, FieldDef, FileRef, ID, ImportTarget, Item, ItemPatch, Kind, NewItem, StatusDef, Tag,
  TagCategory, View,
} from "@/api/types";
import { DEFAULT_VIEWS, archiveViews } from "@/lib/defaults";
import { useFormats } from "@/lib/formats";
import { uid } from "@/lib/format";
import { isViewable } from "@/components/viewer/files";
import { isReadable } from "@/components/reader/source";

export type Dialog =
  | null
  | { type: "metadata"; itemId: ID }
  | { type: "import" }
  | { type: "link" }
  | { type: "archive"; archiveId: ID | null }
  | { type: "deleteArchive"; archiveId: ID };

/** Right-click menu target. */
export type ContextMenu = null | { x: number; y: number; target: { type: "archive"; id: ID } | { type: "view"; id: ID } | { type: "item"; id: ID } };

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
  setSearch(s: string): void;
  setView(id: ID): void;
  patchView(patch: Partial<View>): void;
  createView(): Promise<void>;
  deleteView(id: ID): Promise<void>;

  select(id: ID | null): Promise<void>;
  createItem(input: NewItem): Promise<Item>;
  updateItem(id: ID, patch: ItemPatch): Promise<void>;
  deleteItem(id: ID): Promise<void>;
  importPaths(paths: string[]): Promise<void>;
  importBlobs(files: File[]): Promise<void>;
  saveArchive(a: Archive): Promise<void>;
  createArchive(name: string, icon: string, formatId: string): Promise<Archive>;
  deleteArchive(id: ID): Promise<void>;
  toggleFold(id: ID): void;
  reorderArchives(ids: ID[]): Promise<void>;
  saveStatus(d: StatusDef): Promise<void>;
  deleteStatus(id: string, fallback: string): Promise<void>;
  openMenu(m: ContextMenu): void;
  /** Show/hide/add detail-panel properties for an archive (saved in its view). */
  setPropLayout(archiveId: ID | null, patch: { hidden?: string[]; extra?: string[] }): void;
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
  addCategory(name: string, parentId: ID | null, kind: Kind | null): Promise<Category>;
  saveCategory(c: Category): Promise<void>;
  deleteCategory(id: ID): Promise<void>;
  addToCategory(itemIds: ID[], categoryId: ID): Promise<void>;

  openReader(item: Item, file: FileRef): void;
  closeReader(): void;
  setDialog(d: Dialog): void;
  notify(msg: string, action?: { label: string; run: () => void }): void;
  restoreItem(id: ID): Promise<void>;
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
    kind: a?.kind ?? (v.query.kinds?.length === 1 ? v.query.kinds[0] : undefined),
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
    statuses: [],
    folded: new Set<ID>((() => { try { return JSON.parse(localStorage.getItem(LS_FOLD) ?? "[]") as ID[]; } catch { return []; } })()),
    menu: null,
    tags: [],
    fields: [],
    views: [],
    categories: [],
    activeViewId: lsGet(LS_VIEW) ?? "sys:all",
    categoryId: null,
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
        const [archives, statuses] = await Promise.all([api.listArchives(), api.listStatuses(), useFormats.getState().load()]);
        set({ archives, statuses });
        // Seed / repair built-in views and each archive's two views.
        const wanted = [...DEFAULT_VIEWS, ...archives.flatMap(archiveViews)];
        const missing = wanted.filter((d) => !views.some((v) => v.id === d.id));
        if (missing.length) {
          await Promise.all(missing.map((v) => api.saveView(v)));
          views = await api.listViews();
        }
        const [tags, fields, categories] = await Promise.all([api.listTags(), api.listFields(), api.listCategories()]);
        const activeViewId = views.some((v) => v.id === get().activeViewId) ? get().activeViewId : views[0].id;
        set({ views, tags, fields, categories, activeViewId });
        await get().refresh();
        set({ ready: true });
        api.onLibraryChanged(() => { void get().refresh(); void api.listTags().then((tags) => set({ tags })); });
      } catch (e) {
        fail(e);
        set({ ready: true });
      }
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
      set({ selectedId: id, detail: id ? get().items.find((i) => i.id === id) ?? null : null });
      if (id) await reloadDetail();
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
      get().notify(title ? `"${title}"을(를) 휴지통으로 옮겼어요` : "휴지통으로 옮겼어요", { label: "되돌리기", run: () => void get().restoreItem(id) });
    },

    async restoreItem(id) {
      try { await api.restoreItem(id); await get().refresh(); get().notify("복원했어요"); } catch (e) { fail(e); }
    },
    async purgeItem(id) { await api.purgeItem(id); await get().refresh(); },
    async emptyTrash() { const n = await api.emptyTrash(); await get().refresh(); get().notify(`${n}개를 영구 삭제했어요`); },

    async importPaths(paths) {
      if (!paths.length) return;
      const ctx = viewContext(activeView(get()));
      try {
        const created = await api.importPaths(paths, ctx);
        await markMain(created);
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
      return refs;
    },

    async attachBlobs(itemId, files) {
      if (!api.attachBlobs) return [];
      const refs = await api.attachBlobs(itemId, files);
      mapItem(itemId, (it) => ({ ...it, files: [...it.files, ...refs] }));
      return refs;
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
      set({ tags: await api.listTags() });
      void get().refresh();
      // songs: look for lyrics in the background
      if (saved.kind === "music" && !saved.props?._lyrics) void get().fetchLyrics(itemId, true);
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
      set({ categoryId, catDrawer: false });
      void get().refresh();
    },
    toggleCategories() {
      const v = !get().showCategories;
      lsSet(LS_CATS, v ? "1" : "0");
      set({ showCategories: v });
    },
    async addCategory(name, parentId, kind) {
      const siblings = get().categories.filter((c) => c.parentId === parentId);
      const c: Category = { id: uid(), parentId, kind, name: name.trim() || "새 폴더", position: siblings.length };
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
      await api.deleteCategory(id);
      set({ categories: await api.listCategories() });
      if (get().categoryId && !get().categories.some((c) => c.id === get().categoryId)) set({ categoryId: null });
      await get().refresh();
      await reloadDetail();
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
    async createArchive(name, icon, formatId) {
      const f = useFormats.getState().get(formatId);
      const a: Archive = { id: uid(), name: name.trim() || f.name, icon, kind: f.base, format: f.custom ? f.id : null, position: get().archives.length + 20, pinned: false };
      await api.saveArchive(a);
      const vs = archiveViews(a);
      await Promise.all(vs.map((v) => api.saveView(v)));
      set((s) => ({ archives: [...s.archives, a], views: [...s.views, ...vs] }));
      get().setView(vs[0].id);
      return a;
    },
    async deleteArchive(id) {
      const n = await api.deleteArchive(id);
      set((s) => ({ archives: s.archives.filter((a) => a.id !== id), views: s.views.filter((v) => !v.id.startsWith(`arc:${id}`)) }));
      if (get().activeViewId.startsWith(`arc:${id}`)) get().setView("sys:all"); else void get().refresh();
      get().notify(`아카이브와 항목 ${n}개를 삭제했어요`);
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
      // one entry point for every file: reader (pdf/zip/images), viewer (video/audio/text), else the OS app
      if (isViewable(file)) set({ viewer: { item, file } });
      else if (isReadable(file)) set({ reader: { item, file } });
      else void api.openFile(file).catch(fail);
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
