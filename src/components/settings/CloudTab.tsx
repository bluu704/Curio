import { Check, Cloud, FileKey2, FolderPlus, HardDriveDownload, Link2, Trash2, Upload } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { api } from "@/api";
import { useApp } from "@/store/app";

import { cn } from "@/lib/cn";

/** What the user configured for cloud sync (stored in the library's settings, never in the repository). */
interface DriveFolder { id: string; label: string; archiveId: string | null }
interface CloudConfig {
  google?: { clientId: string; clientSecret?: string; projectId?: string; account?: string | null };
  folders: DriveFolder[];
  mode: "stream" | "download";
  autoImport: boolean;
}
const EMPTY: CloudConfig = { folders: [], mode: "stream", autoImport: true };

/** Drive folder link or raw id → folder id. */
const folderId = (s: string) => s.match(/folders\/([A-Za-z0-9_-]{10,})/)?.[1] ?? (/^[A-Za-z0-9_-]{10,}$/.test(s.trim()) ? s.trim() : null);

export function CloudTab() {
  const { archives } = useApp();
  const [cfg, setCfg] = useState<CloudConfig>(EMPTY);
  const [err, setErr] = useState<string | null>(null);
  const [link, setLink] = useState("");
  const file = useRef<HTMLInputElement>(null);
  useEffect(() => { void api.getSettings<CloudConfig>("cloud").then((c) => c && setCfg({ ...EMPTY, ...c })); }, []);
  const save = (next: CloudConfig) => { setCfg(next); void api.setSettings("cloud", next); };

  const loadClient = async (f: File) => {
    setErr(null);
    try {
      const j = JSON.parse(await f.text());
      const c = j.installed ?? j.web;
      if (!c?.client_id) throw new Error();
      save({ ...cfg, google: { clientId: c.client_id, clientSecret: c.client_secret, projectId: c.project_id, account: null } });
    } catch { setErr("Google Cloud에서 받은 OAuth 클라이언트 JSON 파일을 올려 주세요"); }
  };
  const addFolder = () => {
    const id = folderId(link);
    if (!id) return setErr("Google Drive 폴더 주소를 넣어 주세요 (drive.google.com/drive/folders/…)");
    setErr(null);
    save({ ...cfg, folders: [...cfg.folders.filter((x) => x.id !== id), { id, label: `폴더 ${cfg.folders.length + 1}`, archiveId: null }] });
    setLink("");
  };
  const g = cfg.google;

  return (
    <div className="space-y-5">
      {/* providers */}
      <div className="space-y-2">
        <div className="flex items-center gap-3 rounded-xl border border-line p-3">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-subtle"><Cloud size={18} className="text-muted" /></span>
          <div className="min-w-0 flex-1">
            <div className="font-medium">Google Drive</div>
            <div className="truncate text-[length:calc(12px*var(--ts))] text-muted">{g?.account ? g.account : g ? "클라이언트 등록됨 · 계정 연결 대기" : "OAuth 클라이언트 파일이 필요해요"}</div>
          </div>
          <span className={cn("rounded-md px-2 py-0.5 text-[length:calc(11px*var(--ts))] font-medium", g?.account ? "bg-green-500/15 text-green-600 dark:text-green-400" : "bg-subtle text-muted")}>
            {g?.account ? "연결됨" : "연결 안 됨"}
          </span>
        </div>
        {["OneDrive", "Dropbox"].map((n) => (
          <div key={n} className="flex items-center gap-3 rounded-xl border border-line p-3 opacity-60">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-subtle"><Cloud size={18} className="text-muted" /></span>
            <div className="flex-1 font-medium">{n}</div>
            <span className="rounded-md bg-subtle px-2 py-0.5 text-[length:calc(11px*var(--ts))] text-muted">준비 중</span>
          </div>
        ))}
      </div>

      {/* step 1: client */}
      <section className="space-y-2">
        <div className="label">1 · OAuth 클라이언트 (데스크톱 앱)</div>
        {g ? (
          <div className="flex items-center gap-2 rounded-lg bg-subtle px-3 py-2">
            <FileKey2 size={15} className="text-muted" />
            <span className="min-w-0 flex-1 truncate font-mono text-[length:calc(12px*var(--ts))]">{g.clientId.slice(0, 18)}…{g.projectId ? ` · ${g.projectId}` : ""}</span>
            <Check size={14} className="text-green-500" />
            <button className="btn-icon h-7 w-7 hover:text-danger" onClick={() => save({ ...cfg, google: undefined })} data-tip="삭제"><Trash2 size={13} /></button>
          </div>
        ) : (
          <button className="btn w-full justify-center border border-dashed border-line" onClick={() => file.current?.click()}><Upload size={14} />client_secret_….json 올리기</button>
        )}
        <input ref={file} type="file" accept="application/json,.json" hidden onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) void loadClient(f); }} />
        <p className="text-[length:calc(11px*var(--ts))] text-muted">이 PC의 라이브러리에만 저장돼요. GitHub에는 올라가지 않아요.</p>
      </section>

      {/* step 2: account */}
      <section className="space-y-2">
        <div className="label">2 · 계정 연결</div>
        <button className="btn w-full justify-center border border-line" disabled title="Google Drive 연동 기능이 추가되면 사용할 수 있어요">
          <Link2 size={14} />Google 계정으로 로그인 (연동 기능 추가 후 사용)
        </button>
      </section>

      {/* step 3: folders */}
      <section className="space-y-2">
        <div className="label">3 · 가져올 폴더</div>
        {cfg.folders.map((f) => {
          return (
            <div key={f.id} className="flex items-center gap-2 rounded-lg border border-line p-2">
              <input className="input h-8 w-32" value={f.label} onChange={(e) => save({ ...cfg, folders: cfg.folders.map((x) => (x.id === f.id ? { ...x, label: e.target.value } : x)) })} />
              <span className="min-w-0 flex-1 truncate font-mono text-[length:calc(11px*var(--ts))] text-muted">{f.id}</span>
              <select className="input h-8 w-36" value={f.archiveId ?? ""} onChange={(e) => save({ ...cfg, folders: cfg.folders.map((x) => (x.id === f.id ? { ...x, archiveId: e.target.value || null } : x)) })}>
                <option value="">자동 분류</option>
                {archives.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
              <button className="btn-icon h-8 w-8 hover:text-danger" onClick={() => save({ ...cfg, folders: cfg.folders.filter((x) => x.id !== f.id) })} data-tip="빼기"><Trash2 size={14} /></button>
            </div>
          );
        })}
        <div className="flex gap-2">
          <input className="input flex-1" placeholder="Drive 폴더 주소" value={link} onChange={(e) => setLink(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addFolder()} />
          <button className="btn btn-primary" onClick={addFolder}><FolderPlus size={14} />추가</button>
        </div>
      </section>

      {/* step 4: options */}
      <section className="space-y-2">
        <div className="label">4 · 가져오는 방식</div>
        {([["stream", "Drive에 두고 필요할 때 열기", "PC 용량을 쓰지 않아요", Cloud], ["download", "내 PC로 내려받기", "인터넷 없이도 열 수 있어요", HardDriveDownload]] as const).map(([v, t, d, I]) => (
          <button key={v} onClick={() => save({ ...cfg, mode: v })}
            className={cn("flex w-full items-center gap-3 rounded-lg border p-2.5 text-left", cfg.mode === v ? "border-accent bg-accent/10" : "border-line hover:bg-subtle")}>
            <I size={16} className={cfg.mode === v ? "text-accent" : "text-muted"} />
            <div className="flex-1"><div className="font-medium">{t}</div><div className="text-[length:calc(11px*var(--ts))] text-muted">{d}</div></div>
          </button>
        ))}
        <label className="flex items-center gap-2 pt-1">
          <input type="checkbox" checked={cfg.autoImport} onChange={(e) => save({ ...cfg, autoImport: e.target.checked })} className="h-4 w-4 accent-[rgb(var(--accent))]" />
          폴더에 새 파일이 생기면 자동으로 가져오기
        </label>
      </section>
      {err && <div className="text-[length:calc(12px*var(--ts))] text-danger">{err}</div>}
    </div>
  );
}
