import type { ApiClient } from "../client";

const TOKEN_KEY = "curio.token";
const token = () => {
  try { return localStorage.getItem(TOKEN_KEY) || (import.meta.env.VITE_API_TOKEN as string | undefined) || ""; } catch { return ""; }
};

/**
 * REST adapter for the web / self-hosted server (crates/server).
 * Routes mirror the Tauri commands 1:1 so both backends share `curio-core`.
 */
export function createHttpClient(baseUrl: string): ApiClient {
  const base = baseUrl.replace(/\/$/, "");
  const withToken = (url: string) => (token() ? `${url}${url.includes("?") ? "&" : "?"}token=${encodeURIComponent(token())}` : url);

  async function req<T>(method: string, path: string, body?: unknown): Promise<T> {
    const headers: Record<string, string> = {};
    if (body !== undefined) headers["content-type"] = "application/json";
    if (token()) headers.authorization = `Bearer ${token()}`;
    const res = await fetch(`${base}/api${path}`, { method, headers, body: body !== undefined ? JSON.stringify(body) : undefined });
    if (res.status === 401) {
      const t = prompt("서버 접속 토큰을 입력하세요");
      if (t) { localStorage.setItem(TOKEN_KEY, t); return req(method, path, body); }
    }
    if (!res.ok) throw new Error(`${method} ${path} → ${res.status} ${await res.text()}`);
    return res.status === 204 ? (undefined as T) : res.json();
  }

  return {
    caps: { platform: "http", localFiles: false },

    listItems: (q) => req("POST", "/items/query", q),
    counts: () => req("GET", "/counts"),
    listTrash: () => req("GET", "/trash"),
    trashCount: () => req("GET", "/trash/count"),
    restoreItem: (id) => req("POST", `/trash/${id}/restore`),
    purgeItem: (id) => req("DELETE", `/trash/${id}`),
    listTrashGroups: () => req("GET", "/trash/groups"),
    restoreGroup: (id) => req("POST", `/trash/groups/${encodeURIComponent(id)}/restore`),
    purgeGroup: (id) => req("DELETE", `/trash/groups/${encodeURIComponent(id)}`),
    emptyTrash: () => req("DELETE", "/trash"),
    getSettings: (key) => req("GET", `/settings/${key}`),
    setSettings: (key, value) => req("PUT", `/settings/${key}`, value),
    listArchives: () => req("GET", "/archives"),
    saveArchive: (a) => req("PUT", `/archives/${a.id}`, a),
    deleteArchive: (id) => req("DELETE", `/archives/${id}`),
    bulkCreate: (inputs) => req("POST", "/items/bulk", inputs),
    getItem: (id) => req("GET", `/items/${id}`),
    createItem: (input) => req("POST", "/items", input),
    updateItem: (id, patch) => req("PATCH", `/items/${id}`, patch),
    deleteItem: (id) => req("DELETE", `/items/${id}`),

    listTags: () => req("GET", "/tags"),
    upsertTag: (name, category) => req("POST", "/tags", { name, category }),

    listCategories: () => req("GET", "/categories"),
    saveCategory: (c) => req("PUT", `/categories/${c.id}`, c),
    deleteCategory: (id) => req("DELETE", `/categories/${id}`),
    addToCategory: (itemIds, categoryId) => req("POST", `/categories/${categoryId}/items`, { itemIds }),

    listStatuses: () => req("GET", "/statuses"),
    saveStatus: (d) => req("PUT", `/statuses/${d.id}`, d),
    deleteStatus: (id, fallback) => req("DELETE", `/statuses/${id}?fallback=${encodeURIComponent(fallback)}`),
    listFields: () => req("GET", "/fields"),
    saveField: (f) => req("PUT", `/fields/${f.id}`, f),
    deleteField: (id) => req("DELETE", `/fields/${id}`),

    listViews: () => req("GET", "/views"),
    saveView: (v) => req("PUT", `/views/${v.id}`, v),
    deleteView: (id) => req("DELETE", `/views/${id}`),

    attachPaths: (itemId, paths) => req("POST", `/items/${itemId}/files`, { paths }),
    detachFile: (id) => req("DELETE", `/files/${id}`),
    importPaths: (paths, t) => req("POST", "/import", { paths, ...t }),

    searchMetadata: (kind, query) => req("POST", "/metadata/search", { kind, query }),
    applyMetadata: (itemId, c, overwriteTitle) => req("POST", `/items/${itemId}/metadata`, { candidate: c, overwriteTitle }),
    autofill: (itemId) => req("POST", `/items/${itemId}/autofill`),
    fetchLyrics: (itemId) => req("POST", `/items/${itemId}/lyrics`),
    driveStatus: () => req("GET", "/drive"),
    driveLogin: () => Promise.reject(new Error("이 버전에서는 연결할 수 없어요")),
    driveLogout: () => req("POST", "/drive/logout"),
    driveFolder: (link) => req("POST", "/drive/folder", { link }),
    driveImport: (link, t) => req("POST", "/drive/import", { link, ...t }),
    driveSync: () => req("POST", "/drive/sync"),
    coverFromVideo: (itemId, fileId, seconds) => req("POST", `/items/${itemId}/cover-from-video`, { fileId, seconds }),

    listPages: (f) => req("GET", `/files/${f.id}/pages`),
    pageUrl: (f, i) => withToken(`${base}/api/files/${f.id}/pages/${i}`),
    fileUrl: (f) => withToken(`${base}/api/files/${f.id}/raw`),
    readText: (f) => req("GET", `/files/${f.id}/text`),
    writeText: (f, content) => req("PUT", `/files/${f.id}/text`, { content }),
    downloadFile: async (f) => {
      const a = Object.assign(document.createElement("a"), { href: withToken(`${base}/api/files/${f.id}/raw?download=1`), download: f.name });
      document.body.appendChild(a); a.click(); a.remove();
    },

    listWatchFolders: () => req("GET", "/watch"),
    addWatchFolder: (path, kind, list) => req("POST", "/watch", { path, kind, list }),
    removeWatchFolder: (id) => req("DELETE", `/watch/${id}`),
    rescan: () => req("POST", "/watch/rescan"),
    onLibraryChanged: () => () => {},

    openFile: async (f) => { window.open(withToken(`${base}/api/files/${f.id}/raw`), "_blank"); },
    revealFile: async () => {},
    pickPaths: async () => {
      const p = prompt("서버에서 접근 가능한 경로를 입력하세요");
      return p ? [p] : null;
    },

    mediaUrl: (uri) => {
      if (!uri) return null;
      if (/^(data:|https?:|blob:)/.test(uri)) return uri;
      return withToken(`${base}/api/media?uri=${encodeURIComponent(uri)}`);
    },
  };
}
