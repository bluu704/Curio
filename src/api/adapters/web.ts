import type { ApiClient } from "../client";
import type { DriveStatus, SyncReport } from "../types";
import { createMockClient, emptyDb, mockDb, type DB } from "./mock";
import { cacheRefs, changes, fromSnapshot, merge, toSnapshot, type Snapshot } from "@/web/snapshot";
import * as g from "@/web/google";

/**
 * Browser-only Curio: the library lives in this browser (IndexedDB) and is kept equal to the copy in
 * the user's Google Drive — the same copy the desktop app syncs with. Runs on any static host.
 */

// ---- tiny IndexedDB key/value store
const idb = (() => {
  let open: Promise<IDBDatabase> | null = null;
  const db = () => (open ??= new Promise((res, rej) => {
    const r = indexedDB.open("curio-web", 1);
    r.onupgradeneeded = () => { r.result.createObjectStore("kv"); r.result.createObjectStore("images"); };
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  }));
  const run = async <T,>(store: string, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest): Promise<T> => {
    const d = await db();
    return new Promise((res, rej) => { const q = fn(d.transaction(store, mode).objectStore(store)); q.onsuccess = () => res(q.result as T); q.onerror = () => rej(q.error); });
  };
  return {
    get: <T,>(store: string, key: string) => run<T | undefined>(store, "readonly", (s) => s.get(key)),
    put: (store: string, key: string, v: unknown) => run(store, "readwrite", (s) => s.put(v, key)),
    del: (store: string, key: string) => run(store, "readwrite", (s) => s.delete(key)),
    keys: (store: string) => run<IDBValidKey[]>(store, "readonly", (s) => s.getAllKeys()),
  };
})();

const LIB = "library.json.gz";
/** desktop cover "@cache/thumbs/a.jpg" → app-folder file name "cache~thumbs~a.jpg" (same as the desktop) */
const imageName = (p: string) => `cache~${p.slice("@cache/".length).replace(/\//g, "~")}`;
const images = new Map<string, string>(); // "@cache/…" → blob: URL

export function createWebClient(): ApiClient {
  let saveTimer: ReturnType<typeof setTimeout> | undefined;
  const persist = (db: DB) => { clearTimeout(saveTimer); saveTimer = setTimeout(() => void idb.put("kv", "db", db), 300); };
  const base = createMockClient({ db: emptyDb(), persist });

  // load this browser's library (and cached covers) before the first call is answered
  const ready = (async () => {
    const saved = await idb.get<DB>("kv", "db").catch(() => undefined);
    if (saved) mockDb.set({ ...emptyDb(), ...saved });
    for (const k of await idb.keys("images").catch(() => [] as IDBValidKey[])) {
      const b = await idb.get<Blob>("images", String(k));
      if (b) images.set(String(k), URL.createObjectURL(b));
    }
  })();

  const status = (): DriveStatus => ({ available: !!g.clientId(), builtin: g.builtinClient(), connected: !!g.account(), email: g.account() });

  async function sync(): Promise<SyncReport> {
    await ready;
    const files = await g.listAppFiles();
    const lib = files.find((f) => f.name === LIB);
    const remote: Snapshot | null = lib ? JSON.parse(await g.gunzip(await g.getAppFile(lib.id))) : null;
    const baseSnap = (await idb.get<Snapshot>("kv", "base")) ?? null;
    const db = mockDb.get();
    const local = toSnapshot(db, baseSnap ?? remote);
    const merged = remote ? merge(local, remote, baseSnap) : local;
    const pulled = changes(local, merged);
    if (pulled) mockDb.set(fromSnapshot(merged, db));
    const pushed = remote ? changes(remote, merged) : 1;
    if (pushed) await g.putAppFile(LIB, await g.gzip(JSON.stringify(merged)), lib?.id);
    await idb.put("kv", "base", merged);

    // desktop covers: fetch the ones this browser does not have yet
    const byName = new Map(files.map((f) => [f.name, f.id]));
    let down = 0;
    const want = cacheRefs(merged).filter((p) => !images.has(p) && byName.has(imageName(p)));
    for (let i = 0; i < want.length; i += 6) {
      await Promise.all(want.slice(i, i + 6).map(async (p) => {
        try {
          const b = await g.getAppFile(byName.get(imageName(p))!);
          await idb.put("images", p, b);
          images.set(p, URL.createObjectURL(b));
          down++;
        } catch { /* try again next time */ }
      }));
    }
    const at = Date.now();
    await base.setSettings("sync", { lastSync: at });
    return { pulled, pushed, imagesUp: 0, imagesDown: down, at };
  }

  const web: Partial<ApiClient> = {
    caps: { platform: "web", localFiles: false },
    // covers: data: URLs made here, "@cache/…" covers from the desktop (downloaded in sync), nothing for desktop-only paths
    mediaUrl: (uri) => {
      if (!uri) return null;
      if (uri.startsWith("@cache/")) return images.get(uri) ?? null;
      if (/^(data:|https?:|blob:)/.test(uri)) return uri;
      return null;
    },
    driveStatus: async () => status(),
    driveLogin: async () => { await g.signIn(); return status(); },
    driveLogout: async () => { await g.signOut(); return status(); },
    driveSync: () => sync(),
    driveFolder: async () => { throw new Error("드라이브 폴더 가져오기는 데스크톱 앱에서 할 수 있어요"); },
    driveImport: async () => { throw new Error("드라이브 폴더 가져오기는 데스크톱 앱에서 할 수 있어요"); },
    fetchLyrics: base.fetchLyrics,
  };
  const merged = { ...base, ...web } as ApiClient;

  // every async call waits for the stored library to be loaded
  const sync_ = new Set(["mediaUrl", "fileUrl", "pageUrl", "onLibraryChanged"]);
  return new Proxy(merged, {
    get(t, k: string) {
      const v = (t as unknown as Record<string, unknown>)[k];
      if (typeof v !== "function" || sync_.has(k)) return v;
      return async (...a: unknown[]) => { await ready; return (v as (...x: unknown[]) => unknown).apply(t, a); };
    },
  });
}
