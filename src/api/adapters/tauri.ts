import { convertFileSrc, invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { open as openDialog, save as saveDialog } from "@tauri-apps/plugin-dialog";
import { openPath, revealItemInDir } from "@tauri-apps/plugin-opener";
import type { ApiClient } from "../client";

/** Desktop adapter: every call is a Rust #[tauri::command] in src-tauri/src/commands.rs */
export function createTauriClient(): ApiClient {
  return {
    caps: { platform: "tauri", localFiles: true },

    listItems: (query) => invoke("list_items", { query }),
    counts: () => invoke("counts"),
    listArchives: () => invoke("list_archives"),
    saveArchive: (archive) => invoke("save_archive", { archive }),
    deleteArchive: (id) => invoke("delete_archive", { id }),
    bulkCreate: (inputs) => invoke("bulk_create", { inputs }),
    getItem: (id) => invoke("get_item", { id }),
    createItem: (input) => invoke("create_item", { input }),
    updateItem: (id, patch) => invoke("update_item", { id, patch }),
    deleteItem: (id) => invoke("delete_item", { id }),

    listTags: () => invoke("list_tags"),
    upsertTag: (name, category) => invoke("upsert_tag", { name, category }),

    listCategories: () => invoke("list_categories"),
    saveCategory: (category) => invoke("save_category", { category }),
    deleteCategory: (id) => invoke("delete_category", { id }),
    addToCategory: (itemIds, categoryId) => invoke("add_to_category", { itemIds, categoryId }),

    listStatuses: () => invoke("list_statuses"),
    saveStatus: (status) => invoke("save_status", { status }),
    deleteStatus: (id, fallback) => invoke("delete_status", { id, fallback }),
    listFields: () => invoke("list_fields"),
    saveField: (field) => invoke("save_field", { field }),
    deleteField: (id) => invoke("delete_field", { id }),

    listViews: () => invoke("list_views"),
    saveView: (view) => invoke("save_view", { view }),
    deleteView: (id) => invoke("delete_view", { id }),

    attachPaths: (itemId, paths) => invoke("attach_paths", { itemId, paths }),
    detachFile: (fileId) => invoke("detach_file", { fileId }),
    importPaths: (paths, t) => invoke("import_paths", { paths, kind: t?.kind, list: t?.list, archiveId: t?.archiveId }),

    searchMetadata: (kind, query) => invoke("search_metadata", { kind, query }),
    applyMetadata: (itemId, c, overwriteTitle) => invoke("apply_metadata", { itemId, provider: c.provider, id: c.id, overwriteTitle }),
    autofill: (itemId) => invoke("autofill", { itemId }),

    listPages: (f) => invoke("list_pages", { fileId: f.id }),
    // Custom protocol registered in src-tauri/src/lib.rs (streams one zip entry per request).
    pageUrl: (f, i) => convertFileSrc(`page/${f.id}/${i}`, "curio"),
    fileUrl: (f) => (f.provider === "local" ? convertFileSrc(f.uri) : null),
    readText: (f) => invoke("read_text", { fileId: f.id }),
    writeText: (f, content) => invoke("write_text", { fileId: f.id, content }),
    downloadFile: async (f) => {
      const dest = await saveDialog({ defaultPath: f.name });
      if (dest) await invoke("export_file", { fileId: f.id, dest });
    },

    listWatchFolders: () => invoke("list_watch_folders"),
    addWatchFolder: (path, kind, list) => invoke("add_watch_folder", { path, kind, list }),
    removeWatchFolder: (id) => invoke("remove_watch_folder", { id }),
    rescan: () => invoke("rescan"),
    onLibraryChanged: (cb) => {
      const p = listen("library-changed", () => cb());
      return () => void p.then((un) => un());
    },

    openFile: async (f) => { if (f.provider === "local") await openPath(f.uri); },
    revealFile: async (f) => { if (f.provider === "local") await revealItemInDir(f.uri); },

    pickPaths: async ({ directory, multiple }) => {
      const r = await openDialog({ directory: !!directory, multiple: multiple ?? true });
      if (r == null) return null;
      return Array.isArray(r) ? r : [r];
    },

    mediaUrl: (uri) => {
      if (!uri) return null;
      if (/^(data:|https?:|blob:)/.test(uri)) return uri;
      // Local path → asset:// URL (streamed by Tauri, no base64 copy, works for big files).
      return convertFileSrc(uri);
    },
  };
}
