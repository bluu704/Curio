import { Loader2, RefreshCw, X } from "lucide-react";
import { useEffect, useState } from "react";
import { api } from "@/api";
import type { DriveStatus } from "@/api/types";
import { useApp } from "@/store/app";
import { GoogleMark, syncLibrary } from "@/components/settings/CloudTab";

/**
 * Web version only: one bar to sign in with Google and bring in the library from Drive.
 * Google needs a click for a token, so after a reload the bar offers "동기화" once.
 */
export function WebBar() {
  const [st, setSt] = useState<DriveStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [hidden, setHidden] = useState(false);
  useEffect(() => { void api.driveStatus().then(setSt); }, []);
  if (api.caps.platform !== "web" || !st || done || hidden) return null;

  const go = async () => {
    setBusy(true);
    try {
      if (!st.connected) setSt(await api.driveLogin());
      const r = await syncLibrary();
      if (r) setDone(true);
    } catch (e) {
      useApp.setState({ error: e instanceof Error ? e.message : String(e) });
    } finally { setBusy(false); }
  };

  if (!st.available) return null; // no client configured: Settings → 클라우드 explains it
  return (
    <div className="flex shrink-0 items-center gap-3 border-b border-line bg-accent/10 px-4 py-2 text-[length:calc(13px*var(--ts))] max-md:px-3">
      <span className="min-w-0 flex-1 truncate">
        {st.connected ? <b>{st.email}</b> : "구글 계정으로 로그인하면 라이브러리를 불러와요"}
      </span>
      {!st.connected && (
        <span className="shrink-0 text-[length:calc(11px*var(--ts))] text-muted max-sm:hidden">
          <a href="/privacy.html" target="_blank" rel="noreferrer" className="hover:text-fg hover:underline">개인정보처리방침</a>
          {" · "}
          <a href="/terms.html" target="_blank" rel="noreferrer" className="hover:text-fg hover:underline">약관</a>
        </span>
      )}
      <button className="btn btn-primary h-8 shrink-0" disabled={busy} onClick={() => void go()}>
        {busy ? <Loader2 size={14} className="animate-spin" /> : st.connected ? <RefreshCw size={14} /> : <GoogleMark />}
        {st.connected ? "동기화" : "구글 계정으로 로그인"}
      </button>
      <button className="btn-icon h-8 w-8 shrink-0" onClick={() => setHidden(true)} data-tip="닫기"><X size={15} /></button>
    </div>
  );
}
