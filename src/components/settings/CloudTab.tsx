import { ChevronDown, Cloud, Download, FileKey2, FolderPlus, Loader2, LogOut, Trash2, Upload } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { api } from "@/api";
import type { DriveStatus } from "@/api/types";
import { useApp } from "@/store/app";
import { cn } from "@/lib/cn";

/** Drive folders brought into the library (stored in the library's settings). */
interface DriveFolder { id: string; label: string; archiveId: string | null; lastImport?: number }
export interface CloudConfig {
  /** only for copies of the app built without a Google client (advanced) */
  google?: { clientId: string; clientSecret?: string; projectId?: string };
  folders: DriveFolder[];
  /** bring in new files of these folders whenever the app starts */
  autoImport: boolean;
}
const EMPTY: CloudConfig = { folders: [], autoImport: true };

/** Import one Drive folder into its archive (used by the tab and by the start-up auto import). */
export async function importDriveFolder(f: DriveFolder, quiet = false) {
  const s = useApp.getState();
  const a = s.archives.find((x) => x.id === f.archiveId);
  const res = await api.driveImport(f.id, a ? { archiveId: a.id, kind: a.kind, list: "archive" } : undefined);
  if (res.items.length) await s.refresh();
  if (!quiet || res.items.length) s.notify(res.items.length ? `"${f.label}"에서 ${res.items.length}개를 가져왔어요` : `"${f.label}"에 새 파일이 없어요`);
  return res;
}

/** On start: new files of every linked folder (when the user turned it on). */
export async function autoImportDrive() {
  if (!api.caps.localFiles) return;
  const st = await api.driveStatus().catch(() => null);
  const cfg = await api.getSettings<CloudConfig>("cloud").catch(() => null);
  if (!st?.connected || !cfg?.autoImport) return;
  for (const f of cfg.folders ?? []) await importDriveFolder(f, true).catch(() => undefined);
}

export function CloudTab() {
  const { archives } = useApp();
  const [cfg, setCfg] = useState<CloudConfig>(EMPTY);
  const [st, setSt] = useState<DriveStatus | null>(null);
  const [busy, setBusy] = useState<string | null>(null); // "login" | folder id | "add"
  const [err, setErr] = useState<string | null>(null);
  const [link, setLink] = useState("");
  const [target, setTarget] = useState("");
  const [advanced, setAdvanced] = useState(false);
  const file = useRef<HTMLInputElement>(null);
  useEffect(() => {
    void api.getSettings<CloudConfig>("cloud").then((c) => c && setCfg({ ...EMPTY, ...c }));
    void api.driveStatus().then(setSt).catch(() => setSt(null));
  }, []);
  const save = (next: CloudConfig) => { setCfg(next); void api.setSettings("cloud", next); };
  const run = async (key: string, fn: () => Promise<void>) => {
    setBusy(key); setErr(null);
    try { await fn(); } catch (e) { setErr(e instanceof Error ? e.message : String(e)); } finally { setBusy(null); }
  };

  const login = () => run("login", async () => setSt(await api.driveLogin()));
  const logout = () => run("logout", async () => setSt(await api.driveLogout()));
  const addFolder = () => run("add", async () => {
    const f = await api.driveFolder(link.trim());
    save({ ...cfg, folders: [...cfg.folders.filter((x) => x.id !== f.id), { id: f.id, label: f.name, archiveId: target || null }] });
    setLink("");
  });
  const importOne = (f: DriveFolder) => run(f.id, async () => {
    await importDriveFolder(f);
    save({ ...cfg, folders: cfg.folders.map((x) => (x.id === f.id ? { ...x, lastImport: Date.now() } : x)) });
  });
  const loadClient = async (fl: File) => {
    setErr(null);
    try {
      const j = JSON.parse(await fl.text());
      const c = j.installed ?? j.web;
      if (!c?.client_id) throw new Error();
      save({ ...cfg, google: { clientId: c.client_id, clientSecret: c.client_secret, projectId: c.project_id } });
      setSt(await api.driveStatus());
    } catch { setErr("Google Cloud에서 받은 OAuth 클라이언트 JSON 파일을 올려 주세요"); }
  };

  const connected = !!st?.connected;
  const desktop = api.caps.localFiles;

  return (
    <div className="space-y-5">
      {/* account */}
      <div className="rounded-xl border border-line p-4">
        <div className="flex items-center gap-3">
          <span className={cn("flex h-10 w-10 items-center justify-center rounded-xl", connected ? "bg-accent/15 text-accent" : "bg-subtle text-muted")}><Cloud size={20} /></span>
          <div className="min-w-0 flex-1">
            <div className="font-medium">구글 드라이브</div>
            <div className="truncate text-[length:calc(12px*var(--ts))] text-muted">
              {connected ? `${st?.email ?? "계정"} 연결됨` : busy === "login" ? "브라우저에서 로그인을 마쳐 주세요…" : "드라이브 폴더의 파일을 가져올 수 있어요"}
            </div>
          </div>
          {connected ? (
            <button className="btn h-9 border border-line" disabled={!!busy} onClick={() => void logout()}><LogOut size={14} />연결 해제</button>
          ) : (
            <button className="btn btn-primary h-9" disabled={!!busy || !desktop || (st !== null && !st.available)} onClick={() => void login()}>
              {busy === "login" ? <Loader2 size={15} className="animate-spin" /> : <GoogleMark />}구글 계정으로 연결
            </button>
          )}
        </div>
        {!desktop && <p className="mt-3 text-[length:calc(12px*var(--ts))] text-muted">구글 계정 연결은 데스크톱 앱에서 할 수 있어요. 연결한 라이브러리는 웹에서도 그대로 써요.</p>}
        {desktop && st && !st.available && (
          <p className="mt-3 text-[length:calc(12px*var(--ts))] text-muted">이 버전에는 구글 연결 정보가 들어 있지 않아요. 아래 <b className="text-fg">고급</b>에서 직접 넣을 수 있어요.</p>
        )}
      </div>

      {/* folders */}
      <section className={cn("space-y-2", !connected && "pointer-events-none opacity-50")}>
        <div className="label">가져올 폴더</div>
        {cfg.folders.map((f) => (
          <div key={f.id} className="flex items-center gap-2 rounded-xl border border-line p-2 pl-3">
            <div className="min-w-0 flex-1">
              <div className="truncate font-medium">{f.label}</div>
              <div className="text-[length:calc(11px*var(--ts))] text-muted">{f.lastImport ? `마지막으로 가져온 때 ${new Date(f.lastImport).toLocaleString("ko-KR", { dateStyle: "short", timeStyle: "short" })}` : "아직 가져오지 않았어요"}</div>
            </div>
            <select className="input h-8 w-32" value={f.archiveId ?? ""} onChange={(e) => save({ ...cfg, folders: cfg.folders.map((x) => (x.id === f.id ? { ...x, archiveId: e.target.value || null } : x)) })}>
              <option value="">자동 분류</option>
              {archives.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
            <button className="btn btn-primary h-8" disabled={!!busy} onClick={() => void importOne(f)}>
              {busy === f.id ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}가져오기
            </button>
            <button className="btn-icon h-8 w-8 hover:text-danger" onClick={() => save({ ...cfg, folders: cfg.folders.filter((x) => x.id !== f.id) })} data-tip="목록에서 빼기 (가져온 항목은 그대로)"><Trash2 size={14} /></button>
          </div>
        ))}
        <div className="flex gap-2">
          <input className="input flex-1" placeholder="드라이브 폴더 주소를 붙여넣으세요" value={link} onChange={(e) => setLink(e.target.value)} onKeyDown={(e) => e.key === "Enter" && link.trim() && void addFolder()} />
          <select className="input w-32" value={target} onChange={(e) => setTarget(e.target.value)}>
            <option value="">자동 분류</option>
            {archives.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
          <button className="btn btn-primary" disabled={!link.trim() || !!busy} onClick={() => void addFolder()}>
            {busy === "add" ? <Loader2 size={14} className="animate-spin" /> : <FolderPlus size={14} />}추가
          </button>
        </div>
        <label className="flex items-center gap-2 pt-1">
          <input type="checkbox" checked={cfg.autoImport} onChange={(e) => save({ ...cfg, autoImport: e.target.checked })} className="h-4 w-4 accent-[rgb(var(--accent))]" />
          앱을 열 때 새 파일을 자동으로 가져오기
        </label>
        <p className="text-[length:calc(11px*var(--ts))] text-muted">파일은 이 PC에 내려받아 저장돼요. 하위 폴더 안의 파일도 함께 가져오고, 이미 가져온 파일은 건너뛰어요.</p>
      </section>

      {err && <div className="rounded-lg bg-danger/10 px-3 py-2 text-[length:calc(12px*var(--ts))] text-danger">{err}</div>}

      {/* advanced: only for builds without a built-in client */}
      {desktop && !st?.builtin && (
        <section className="border-t border-line pt-4">
          <button className="flex items-center gap-1 text-[length:calc(12px*var(--ts))] text-muted hover:text-fg" onClick={() => setAdvanced(!advanced)}>
            <ChevronDown size={14} className={cn("transition-transform", !advanced && "-rotate-90")} />고급 · 직접 만든 구글 연결 정보 쓰기
          </button>
          {advanced && (
            <div className="mt-2 space-y-2">
              {cfg.google ? (
                <div className="flex items-center gap-2 rounded-lg bg-subtle px-3 py-2">
                  <FileKey2 size={15} className="text-muted" />
                  <span className="min-w-0 flex-1 truncate font-mono text-[length:calc(12px*var(--ts))]">{cfg.google.clientId.slice(0, 18)}…{cfg.google.projectId ? ` · ${cfg.google.projectId}` : ""}</span>
                  <button className="btn-icon h-7 w-7 hover:text-danger" onClick={() => { save({ ...cfg, google: undefined }); void api.driveStatus().then(setSt); }} data-tip="지우기"><Trash2 size={13} /></button>
                </div>
              ) : (
                <button className="btn w-full justify-center border border-dashed border-line" onClick={() => file.current?.click()}><Upload size={14} />OAuth 클라이언트 JSON 올리기</button>
              )}
              <input ref={file} type="file" accept="application/json,.json" hidden onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) void loadClient(f); }} />
              <p className="text-[length:calc(11px*var(--ts))] text-muted">앱을 직접 빌드할 때 프로젝트 폴더에 이 파일을 넣어 두면 앱에 들어가서, 쓰는 사람은 버튼만 누르면 돼요.</p>
            </div>
          )}
        </section>
      )}

      <div className="flex gap-2 text-[length:calc(12px*var(--ts))] text-muted">
        {["OneDrive", "Dropbox"].map((n) => <span key={n} className="rounded-md bg-subtle px-2 py-1">{n} · 준비 중</span>)}
      </div>
    </div>
  );
}

/** Google "G" mark. */
function GoogleMark() {
  return (
    <svg width="15" height="15" viewBox="0 0 48 48" aria-hidden className="shrink-0 rounded-full bg-white p-[1px]">
      <path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9.1 3.6l6.8-6.8C35.8 2.4 30.3 0 24 0 14.6 0 6.6 5.4 2.7 13.3l7.9 6.1C12.5 13.6 17.8 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.1 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.4c-.5 2.9-2.2 5.3-4.6 7l7.4 5.7c4.3-4 6.9-9.9 6.9-17.2z" />
      <path fill="#FBBC05" d="M10.6 28.6c-.5-1.4-.8-2.9-.8-4.6s.3-3.2.8-4.6l-7.9-6.1C1 16.6 0 20.2 0 24s1 7.4 2.7 10.7l7.9-6.1z" />
      <path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.4-5.7c-2.1 1.4-4.8 2.3-8.5 2.3-6.2 0-11.5-4.1-13.4-9.9l-7.9 6.1C6.6 42.6 14.6 48 24 48z" />
    </svg>
  );
}
