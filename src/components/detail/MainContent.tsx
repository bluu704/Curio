import { Camera, Expand, Loader2, Pencil } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { api } from "@/api";
import type { FileRef, Item } from "@/api/types";
import { useApp } from "@/store/app";
import { isMarkdown } from "@/components/viewer/files";
import { MarkdownView } from "@/components/viewer/MarkdownView";
import { cn } from "@/lib/cn";
import { coverFromVideo } from "@/lib/videoCover";
import { disposeAni, isAniName, parseAni, type AniAnim } from "@/lib/ani";
import { AniImage } from "@/components/ui/AniImage";

/** The item's own content when it was made from one picture / text / video file. */
export function MainContent({ item, file }: { item: Item; file: FileRef }) {
  const openReader = useApp((s) => s.openReader);
  if (file.kind === "image" && isAniName(file.name)) return <AniContent item={item} file={file} />;
  if (file.kind === "image") {
    const src = api.fileUrl(file) ?? api.mediaUrl(item.coverUri);
    return (
      <button className="group relative mt-4 block w-full overflow-hidden rounded-xl bg-subtle ring-1 ring-line/60" onClick={() => openReader(item, file)} data-tip="크게 보기">
        {src ? <img src={src} alt="" className="mx-auto block max-h-[70vh] w-auto max-w-full object-contain" /> : <div className="aspect-[4/3]" />}
        <span className="absolute right-2 top-2 flex h-8 w-8 items-center justify-center rounded-lg bg-black/40 text-white opacity-0 backdrop-blur transition-opacity group-hover:opacity-100"><Expand size={15} /></span>
      </button>
    );
  }
  if (file.kind === "video") {
    const src = api.fileUrl(file);
    return src ? <VideoContent item={item} file={file} src={src} /> : (
      <div className="mt-4 rounded-xl bg-subtle p-4 text-center text-[length:calc(12px*var(--ts))] text-muted">이 영상을 여기서 재생할 수 없어요</div>
    );
  }
  return <TextContent item={item} file={file} />;
}

/** The item's video, with "현재 장면을 표지로" for the frame it is paused on. */
function VideoContent({ item, file, src }: { item: Item; file: FileRef; src: string }) {
  const ref = useRef<HTMLVideoElement>(null);
  const [busy, setBusy] = useState(false);
  const grab = async () => {
    if (!ref.current) return;
    setBusy(true);
    try { await coverFromVideo(ref.current, item.id, file.id); }
    catch (e) { useApp.setState({ error: e instanceof Error ? e.message : String(e) }); }
    finally { setBusy(false); }
  };
  return (
    <div className="mt-4">
      <video ref={ref} key={file.id} src={src} controls playsInline preload="metadata" className="block max-h-[60vh] w-full rounded-xl bg-black" />
      <div className="mt-1.5 flex justify-end">
        <button className="btn h-7 px-2 text-[length:calc(12px*var(--ts))] text-muted hover:text-fg" disabled={busy} onClick={() => void grab()}>
          {busy ? <Loader2 size={13} className="animate-spin" /> : <Camera size={13} />}현재 장면을 표지로
        </button>
      </div>
    </div>
  );
}

/** Animated cursor: parsed and played in place. */
function AniContent({ item, file }: { item: Item; file: FileRef }) {
  const openReader = useApp((s) => s.openReader);
  const [anim, setAnim] = useState<AniAnim | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    let a: AniAnim | null = null, alive = true;
    const url = api.fileUrl(file);
    if (!url) { setErr("파일을 열 수 없어요"); return; }
    fetch(url).then((r) => r.arrayBuffer()).then((b) => { a = parseAni(b); if (alive) setAnim(a); else disposeAni(a); })
      .catch((e) => setErr(e instanceof Error ? e.message : String(e)));
    return () => { alive = false; if (a) disposeAni(a); };
  }, [file]);
  return (
    <button className="mt-4 flex w-full items-center justify-center rounded-xl bg-subtle py-8 ring-1 ring-line/60" onClick={() => openReader(item, file)} data-tip="크게 보기">
      {anim ? <AniImage anim={anim} scale={4} /> : <span className="text-[length:calc(12px*var(--ts))] text-muted">{err ?? "불러오는 중…"}</span>}
    </button>
  );
}

function TextContent({ item, file }: { item: Item; file: FileRef }) {
  const openReader = useApp((s) => s.openReader);
  const [text, setText] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    setText(null); setErr(null);
    api.readText(file).then(setText).catch((e) => setErr(e instanceof Error ? e.message : String(e)));
  }, [file]);
  const long = (text?.length ?? 0) > 1200;
  return (
    <div className="mt-4 rounded-xl border border-line bg-surface">
      <div className="flex items-center gap-1 border-b border-line px-3 py-1.5">
        <span className="min-w-0 flex-1 truncate text-[length:calc(12px*var(--ts))] text-muted">{file.name}</span>
        <button className="btn-icon h-7 w-7" onClick={() => openReader(item, file)} data-tip="보기·편집"><Pencil size={14} /></button>
      </div>
      <div className={cn("relative overflow-hidden px-4 py-3", long && !open && "max-h-80")}>
        {err ? <div className="text-[length:calc(12px*var(--ts))] text-danger">{err}</div>
          : text === null ? <div className="h-16 animate-pulse rounded bg-subtle" />
          : isMarkdown(file) ? <MarkdownView text={text} />
          : <div className="whitespace-pre-wrap break-words text-[length:calc(13px*var(--ts))] leading-relaxed">{text}</div>}
        {long && !open && <div className="pointer-events-none absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-surface to-transparent" />}
      </div>
      {long && <button className="w-full border-t border-line py-1.5 text-[length:calc(12px*var(--ts))] text-muted hover:text-fg" onClick={() => setOpen(!open)}>{open ? "접기" : "전체 보기"}</button>}
    </div>
  );
}
