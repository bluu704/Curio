import { Camera, Loader2 } from "lucide-react";
import { useRef, useState } from "react";
import { api } from "@/api";
import { useApp } from "@/store/app";
import { Modal } from "@/components/ui/Modal";
import { coverFromVideo } from "@/lib/videoCover";

const t = (x: number) => `${Math.floor(x / 60)}:${String(Math.floor(x % 60)).padStart(2, "0")}`;

/** Scrub through a video and use the frame you stop on as the cover. */
export function VideoCoverDialog() {
  const s = useApp();
  const d = s.dialog?.type === "videoCover" ? s.dialog : null;
  const video = useRef<HTMLVideoElement>(null);
  const [pos, setPos] = useState(0);
  const [dur, setDur] = useState(0);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  if (!d) return null;
  const item = s.detail?.id === d.itemId ? s.detail : s.items.find((i) => i.id === d.itemId);
  const file = item?.files.find((f) => f.id === d.fileId);
  const src = file ? api.fileUrl(file) : null;
  const close = () => { setErr(null); s.setDialog(null); };

  const use = async () => {
    if (!video.current) return;
    setBusy(true); setErr(null);
    try { await coverFromVideo(video.current, d.itemId, d.fileId); close(); }
    catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(false); }
  };

  return (
    <Modal open onClose={close} title="영상에서 표지 고르기" width={720}>
      {src ? (
        <div className="space-y-3">
          <video ref={video} src={src} preload="auto" playsInline muted
            onLoadedMetadata={(e) => { setDur(e.currentTarget.duration || 0); e.currentTarget.currentTime = Math.min(5, (e.currentTarget.duration || 0) * 0.1); }}
            onTimeUpdate={(e) => setPos(e.currentTarget.currentTime)}
            className="aspect-video w-full rounded-xl bg-black object-contain" />
          <div className="flex items-center gap-3">
            <span className="w-12 text-right font-mono text-[length:calc(12px*var(--ts))] tabular-nums text-muted">{t(pos)}</span>
            <input type="range" min={0} max={dur || 0} step={0.04} value={pos}
              onChange={(e) => { const v = Number(e.target.value); setPos(v); if (video.current) video.current.currentTime = v; }}
              className="flex-1 accent-[rgb(var(--accent))]" />
            <span className="w-12 font-mono text-[length:calc(12px*var(--ts))] tabular-nums text-muted">{t(dur)}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="flex-1 text-[length:calc(12px*var(--ts))] text-muted">{err ? <span className="text-danger">{err}</span> : "막대를 움직여 장면을 고르세요"}</span>
            <button className="btn h-9 border border-line" onClick={close}>취소</button>
            <button className="btn btn-primary h-9" disabled={busy || !dur} onClick={() => void use()}>
              {busy ? <Loader2 size={15} className="animate-spin" /> : <Camera size={15} />}이 장면을 표지로
            </button>
          </div>
        </div>
      ) : (
        <div className="py-8 text-center text-muted">이 영상을 열 수 없어요</div>
      )}
    </Modal>
  );
}
