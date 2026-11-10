import type { ApiClient } from "../client";
import type { DriveStatus, FileRef, SyncReport } from "../types";
import { createMockClient, emptyDb, getMockBlob, hasMockBlob, mockBlobsReady, mockDb, putMockBlob, type DB } from "./mock";
import { sentFiles } from "@/lib/itemFlags";
import { cacheRefs, changes, cloudUri, fromSnapshot, isBrowserFile, isCloudUri, isLocalOnly, merge, offArchives, toSnapshot, type Snapshot } from "@/web/snapshot";
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
const ON_PC = "PC에만 있는 파일이에요";
/** desktop cover "@cache/thumbs/a.jpg" → app-folder file name "cache~thumbs~a.jpg" (same as the desktop) */
const imageName = (p: string) => `cache~${p.slice("@cache/".length).replace(/\//g, "~")}`;
const images = new Map<string, string>(); // "@cache/…" → blob: URL

export function createWebClient(): ApiClient {
  /**
   * Each Google account has its own library in this browser ("guest" = not signed in), so signing out
   * or switching accounts never shows someone else's items.
   */
  const profileOf = () => (g.account() ?? "").trim().toLowerCase() || "guest";
  let profile = profileOf();
  const key = (k: string, p = profile) => `${k}:${p}`;
  const imgKey = (path: string, p = profile) => `${p}|${path}`;

  let saveTimer: ReturnType<typeof setTimeout> | undefined;
  const persist = (db: DB) => { clearTimeout(saveTimer); const p = profile; saveTimer = setTimeout(() => void idb.put("kv", key("db", p), db), 300); };
  const flush = async () => { clearTimeout(saveTimer); await idb.put("kv", key("db"), mockDb.get()); };
  const base = createMockClient({ db: emptyDb(), persist });

  // app-folder files by name (refreshed on every sync, remembered between visits)
  let appFiles = new Map<string, string>();
  const rememberFiles = (list: { id: string; name: string }[]) => { appFiles = new Map(list.map((f) => [f.name, f.id])); void idb.put("kv", key("appfiles"), [...appFiles]); };

  /** Show the library (and cached covers) of the current profile. */
  async function loadProfile() {
    const saved = await idb.get<DB>("kv", key("db")).catch(() => undefined);
    mockDb.set(saved ? { ...emptyDb(), ...saved } : emptyDb());
    images.forEach((u) => URL.revokeObjectURL(u));
    images.clear();
    for (const k of await idb.keys("images").catch(() => [] as IDBValidKey[])) {
      const [p, path] = String(k).split(/\|(.*)/s);
      if (p !== profile || !path) continue;
      const b = await idb.get<Blob>("images", String(k));
      if (b) images.set(path, URL.createObjectURL(b));
    }
    appFiles = new Map((await idb.get<[string, string][]>("kv", key("appfiles")).catch(() => undefined)) ?? []);
  }

  /** Libraries saved before accounts were kept apart belong to whoever is signed in now. */
  async function migrateOld() {
    const old = await idb.get<DB>("kv", "db").catch(() => undefined);
    if (!old) return;
    if (!(await idb.get("kv", key("db")))) await idb.put("kv", key("db"), old);
    for (const k of ["base", "appfiles"]) {
      const v = await idb.get("kv", k);
      if (v !== undefined) { await idb.put("kv", key(k), v); await idb.del("kv", k); }
    }
    for (const k of await idb.keys("images").catch(() => [] as IDBValidKey[])) {
      const s = String(k);
      if (s.includes("|")) continue;
      const b = await idb.get<Blob>("images", s);
      if (b) await idb.put("images", imgKey(s), b);
      await idb.del("images", s);
    }
    await idb.del("kv", "db");
  }

  // load this browser's library before the first call is answered
  const ready = (async () => { await migrateOld().catch(() => undefined); await loadProfile(); })();

  const listeners = new Set<() => void>();
  /** Signed in / out: switch to that account's library. What was made before signing in joins the account. */
  async function switchProfile() {
    const next = profileOf();
    if (next === profile) return;
    await flush();
    const prev = profile;
    const guest = prev === "guest" ? mockDb.get() : null;
    profile = next;
    if (guest && (guest.items.length || guest.trash.length) && !(await idb.get("kv", key("db")))) {
      await idb.put("kv", key("db"), guest); // first sign-in: keep what was made while signed out
      await idb.put("kv", key("db", "guest"), emptyDb());
    }
    await loadProfile();
    listeners.forEach((f) => f());
  }
  const driveCopy = (fileId: string) => [...appFiles.keys()].filter((n) => n.startsWith(`file~${fileId}~`)).sort().pop();

  /** Bytes of a PC file that travels with the library: from this browser's cache, else from Drive. */
  async function ensureFile(f: FileRef) {
    await ready;
    await mockBlobsReady();
    if (isBrowserFile(f) || hasMockBlob(f.id)) return;
    let name = driveCopy(f.id);
    if (!name) { rememberFiles(await g.listAppFiles()); name = driveCopy(f.id); }
    if (!name) throw new Error(ON_PC);
    const blob = await g.getAppFile(appFiles.get(name)!);
    putMockBlob(f.id, new File([blob], f.name, { type: blob.type || "application/octet-stream" }));
  }
  const fetched = (f: FileRef) => isBrowserFile(f) || hasMockBlob(f.id);

  const status = (): DriveStatus => ({ available: !!g.clientId(), builtin: g.builtinClient(), connected: !!g.account(), email: g.account() });

  async function sync(): Promise<SyncReport> {
    await ready;
    const files = await g.listAppFiles();
    rememberFiles(files);
    const lib = files.find((f) => f.name === LIB);
    const remote: Snapshot | null = lib ? JSON.parse(await g.gunzip(await g.getAppFile(lib.id))) : null;
    const baseSnap = (await idb.get<Snapshot>("kv", key("base"))) ?? null;
    const db = mockDb.get();
    // uploads made here, up to the size limit, become shared files (desktop keeps them in its data folder)
    const limitMb = Number((db.settings.cloud as { fileSyncMb?: number } | undefined)?.fileSyncMb ?? 50);
    await mockBlobsReady();
    let converted = false;
    const off = offArchives(db.settings);
    for (const it of db.items) {
      if (isLocalOnly(it, off)) continue;
      const forced = sentFiles(it); // bigger files sent to Drive by hand
      for (const f of it.files) {
        const fits = limitMb > 0 && (f.size ?? 0) <= limitMb * 1024 * 1024;
        if (isBrowserFile(f) && (fits || forced.has(f.id)) && hasMockBlob(f.id)) { f.uri = cloudUri(f); converted = true; }
      }
    }
    if (converted) mockDb.set(db);
    const local = toSnapshot(db, baseSnap ?? remote);
    const merged = remote ? merge(local, remote, baseSnap) : local;
    const pulled = changes(local, merged);
    if (pulled) mockDb.set(fromSnapshot(merged, db));
    const pushed = remote ? changes(remote, merged) : 1;
    if (pushed) await g.putAppFile(LIB, await g.gzip(JSON.stringify(merged)), lib?.id);
    await idb.put("kv", key("base"), merged);

    // shared uploads from this browser that Drive does not have yet (after the library, so a desktop
    // that syncs in between only misses the bytes until next time — it never sees bytes without a record)
    let filesUp = 0;
    const onDrive = new Set(files.map((f) => f.name.split("~").slice(0, 2).join("~")));
    for (const r of Object.values(merged.tables.files ?? {})) {
      const id = String(r.id);
      if (!isCloudUri(String(r.uri)) || onDrive.has(`file~${id}`)) continue;
      const blob = getMockBlob(id);
      if (!blob) continue;
      await g.putAppFile(`file~${id}~${Math.floor(Date.now() / 1000)}`, blob);
      filesUp++;
    }
    // copies nothing uses any more (item switched off / deleted, file detached, cover replaced)
    const fileIds = new Set(Object.values(merged.tables.files ?? {}).map((r) => String(r.id)));
    const coverNames = new Set(cacheRefs(merged).map(imageName));
    for (const f of files) {
      const unused = f.name.startsWith("file~") ? !fileIds.has(f.name.split("~")[1]) : f.name.startsWith("cache~") ? !coverNames.has(f.name) : false;
      if (unused) await g.deleteAppFile(f.id).catch(() => undefined);
    }

    // desktop covers: fetch the ones this browser does not have yet
    const byName = new Map(files.map((f) => [f.name, f.id]));
    let down = 0;
    const want = cacheRefs(merged).filter((p) => !images.has(p) && byName.has(imageName(p)));
    for (let i = 0; i < want.length; i += 6) {
      await Promise.all(want.slice(i, i + 6).map(async (p) => {
        try {
          const b = await g.getAppFile(byName.get(imageName(p))!);
          await idb.put("images", imgKey(p), b);
          images.set(p, URL.createObjectURL(b));
          down++;
        } catch { /* try again next time */ }
      }));
    }
    const at = Date.now();
    await base.setSettings("sync", { lastSync: at });
    return { pulled, pushed, imagesUp: 0, imagesDown: down, filesUp, at };
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
    driveLogin: async () => { await g.signIn(); await switchProfile(); return status(); },
    driveLogout: async () => { await g.signOut(); await switchProfile(); return status(); },
    onLibraryChanged: (cb) => { listeners.add(cb); return () => listeners.delete(cb); },
    driveSync: () => sync(),
    driveFolder: async () => { throw new Error("데스크톱 앱에서만 돼요"); },
    driveImport: async () => { throw new Error("데스크톱 앱에서만 돼요"); },
    fetchLyrics: base.fetchLyrics,
    // PC files: fetched from Drive on first use (when small enough to travel with the library)
    ensureFile,
    downloadFile: async (f) => { await ensureFile(f); return base.downloadFile(f); },
    listPages: async (f) => { await ensureFile(f); return base.listPages(f); },
    readText: async (f) => { await ensureFile(f); return base.readText(f); },
    writeText: async (f, t) => { if (!isBrowserFile(f)) throw new Error("PC에 있는 파일은 웹에서 고칠 수 없어요"); return base.writeText(f, t); },
    fileUrl: (f) => (fetched(f) ? base.fileUrl(f) : null),
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
