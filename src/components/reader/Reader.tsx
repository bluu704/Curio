import {
  ArrowLeftRight, ChevronLeft, ChevronRight, Columns2, Loader2, Maximize, MoveVertical, RectangleVertical, Rows3, X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useApp } from "@/store/app";
import { cn } from "@/lib/cn";
import { openSource, type PageSource } from "./source";
import { aniPages } from "@/lib/ani";
import { AniImage } from "@/components/ui/AniImage";

type Mode = "single" | "double" | "scroll";
interface Prefs { mode: Mode; rtl: boolean; fit: "height" | "width" }
const PREFS = "curio.reader";
const POS = (id: string) => `curio.reader.pos.${id}`;
const ls = {
  get<T>(k: string, d: T): T { try { const v = localStorage.getItem(k); return v ? (JSON.parse(v) as T) : d; } catch { return d; } },
  set(k: string, v: unknown) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* ignore */ } },
};

/** Full-screen reader for CBZ/ZIP, image folders and PDF. */
export function Reader() {
  const { reader, closeReader } = useApp();
  if (!reader) return null;
  return <ReaderInner key={reader.file.id} title={reader.item.title} fileId={reader.file.id} onClose={closeReader} />;
}

function ReaderInner({ title, fileId, onClose }: { title: string; fileId: string; onClose: () => void }) {
  const file = useApp((s) => s.reader!.file);
  const [src, setSrc] = useState<PageSource | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(() => ls.get(POS(fileId), 0));
  const [prefs, setPrefs] = useState<Prefs>(() => ls.get(PREFS, { mode: "single", rtl: true, fit: "height" }));
  const [chrome, setChrome] = useState(true);
  const hideTimer = useRef<ReturnType<typeof setTimeout>>();
  const swipe = useRef<number | null>(null);

  useEffect(() => {
    let alive = true;
    let opened: PageSource | null = null;
    openSource(file)
      .then((s) => { opened = s; if (alive) { setSrc(s); setPage((p) => Math.min(p, Math.max(0, s.count - 1))); } else s.dispose(); })
      .catch((e) => alive && setError(e instanceof Error ? e.message : String(e)));
    return () => { alive = false; opened?.dispose(); };
  }, [file]);

  useEffect(() => ls.set(POS(fileId), page), [fileId, page]);

  // PDFs have no extracted cover: use the rendered first page the first time it is opened.
  useEffect(() => {
    const st = useApp.getState();
    const item = st.reader?.item;
    if (!src || !item || item.coverUri || !/\.pdf$/i.test(file.name)) return;
    void src.url(0).then((u) => {
      const img = new Image();
      img.onload = () => {
        const scale = Math.min(1, 480 / img.width);
        const c = document.createElement("canvas");
        c.width = img.width * scale; c.height = img.height * scale;
        c.getContext("2d")!.drawImage(img, 0, 0, c.width, c.height);
        void st.updateItem(item.id, { coverUri: c.toDataURL("image/jpeg", 0.85) });
      };
      img.src = u;
    });
  }, [src, file.name]);
  const savePrefs = (p: Partial<Prefs>) => setPrefs((cur) => { const n = { ...cur, ...p }; ls.set(PREFS, n); return n; });

  const count = src?.count ?? 0;
  const step = prefs.mode === "double" ? 2 : 1;
  const go = useCallback((d: number) => setPage((p) => Math.max(0, Math.min(count - 1, p + d))), [count]);
  const next = useCallback(() => go(step), [go, step]);
  const prev = useCallback(() => go(-step), [go, step]);

  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (prefs.mode === "scroll") return;
      const fwd = prefs.rtl ? "ArrowLeft" : "ArrowRight";
      const back = prefs.rtl ? "ArrowRight" : "ArrowLeft";
      if (e.key === fwd || e.key === " " || e.key === "PageDown") { e.preventDefault(); next(); }
      if (e.key === back || e.key === "PageUp") { e.preventDefault(); prev(); }
      if (e.key === "Home") setPage(0);
      if (e.key === "End") setPage(Math.max(0, count - 1));
    };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [prefs, next, prev, count, onClose]);

  const poke = () => {
    setChrome(true);
    clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => setChrome(false), 2200);
  };

  const spread = useMemo(() => {
    if (prefs.mode !== "double") return [page];
    // First page is a cover → shown alone; after that pairs (1,2), (3,4)…
    if (page === 0) return [0];
    const start = page % 2 === 1 ? page : page - 1;
    return [start, start + 1].filter((i) => i < count);
  }, [page, prefs.mode, count]);
  const shown = prefs.rtl ? [...spread].reverse() : spread;

  return (
    <div className="anim-fade fixed inset-0 z-[80] flex flex-col bg-[#0b0b0d] text-white" onMouseMove={poke}>
      {/* top bar */}
      <div className={cn("absolute inset-x-0 top-0 z-10 flex h-12 items-center gap-2 bg-gradient-to-b from-black/80 to-transparent px-3 transition-opacity", chrome ? "opacity-100" : "opacity-0")}>
        <button className="rd-btn" onClick={onClose} data-tip="닫기 (Esc)"><X size={18} /></button>
        <div className="min-w-0 flex-1 truncate text-[length:calc(13px*var(--ts))] font-medium">{title} <span className="text-white/50">· {file.name}</span></div>
        <span className="mr-2 text-[length:calc(12px*var(--ts))] tabular-nums text-white/70">{count ? `${Math.min(page + 1, count)} / ${count}` : ""}</span>
        <div className="flex rounded-lg bg-white/10 p-0.5">
          {([["single", RectangleVertical, "한 쪽"], ["double", Columns2, "두 쪽"], ["scroll", Rows3, "세로 스크롤 (웹툰)"]] as const).map(([m, I, tip]) => (
            <button key={m} className={cn("rd-btn h-7 w-7", prefs.mode === m && "bg-white/20")} onClick={() => savePrefs({ mode: m })} data-tip={tip}><I size={15} /></button>
          ))}
        </div>
        {prefs.mode !== "scroll" && (
          <>
            <button className={cn("rd-btn", prefs.rtl && "bg-white/15")} onClick={() => savePrefs({ rtl: !prefs.rtl })} data-tip={prefs.rtl ? "오른쪽→왼쪽 (만화)" : "왼쪽→오른쪽"}><ArrowLeftRight size={16} /></button>
            <button className="rd-btn" onClick={() => savePrefs({ fit: prefs.fit === "height" ? "width" : "height" })} data-tip={prefs.fit === "height" ? "높이 맞춤" : "너비 맞춤"}>
              {prefs.fit === "height" ? <MoveVertical size={16} /> : <Maximize size={16} />}
            </button>
          </>
        )}
      </div>

      {error ? (
        <div className="m-auto max-w-md text-center text-[length:calc(13px*var(--ts))] text-white/70">{error}</div>
      ) : !src ? (
        <Loader2 className="m-auto animate-spin text-white/50" size={28} />
      ) : prefs.mode === "scroll" ? (
        <ScrollPages src={src} start={page} onPage={setPage} />
      ) : (
        <div
          className={cn("relative flex min-h-0 flex-1 justify-center", prefs.fit === "height" ? "items-center overflow-hidden" : "items-start overflow-y-auto")}
          // touch swipe: left/right turns pages (direction follows the reading direction)
          onPointerDown={(e) => { if (e.pointerType === "touch") swipe.current = e.clientX; }}
          onPointerUp={(e) => {
            if (swipe.current == null) return;
            const dx = e.clientX - swipe.current;
            swipe.current = null;
            if (Math.abs(dx) > 50) ((dx < 0) !== prefs.rtl ? next : prev)();
          }}
        >
          {shown.map((i) => <PageImg key={i} src={src} index={i} fit={prefs.fit} half={shown.length === 2} />)}
          {/* click zones */}
          <button className="absolute inset-y-0 left-0 w-1/3 cursor-w-resize" onClick={prefs.rtl ? next : prev} aria-label="이전/다음" />
          <button className="absolute inset-y-0 right-0 w-1/3 cursor-e-resize" onClick={prefs.rtl ? prev : next} aria-label="다음/이전" />
          {chrome && (
            <>
              <ChevronLeft className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-white/40" size={30} />
              <ChevronRight className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-white/40" size={30} />
            </>
          )}
        </div>
      )}

      {/* bottom slider */}
      {count > 1 && prefs.mode !== "scroll" && (
        <div className={cn("absolute inset-x-0 bottom-0 flex items-center gap-3 bg-gradient-to-t from-black/80 to-transparent px-6 pb-4 pt-8 transition-opacity", chrome ? "opacity-100" : "opacity-0")}>
          <input type="range" min={0} max={count - 1} value={page} onChange={(e) => setPage(Number(e.target.value))}
            className="w-full accent-[rgb(var(--accent))]" style={{ direction: prefs.rtl ? "rtl" : "ltr" }} />
        </div>
      )}
    </div>
  );
}

function PageImg({ src, index, fit, half }: { src: PageSource; index: number; fit: "height" | "width"; half: boolean }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    setUrl(null);
    void src.url(index).then((u) => alive && setUrl(u));
    // prefetch neighbours
    for (const n of [index + 1, index + 2]) if (n < src.count) void src.url(n);
    return () => { alive = false; };
  }, [src, index]);
  if (!url) return <Loader2 className="m-auto animate-spin text-white/40" size={24} />;
  const ani = aniPages.get(url);
  if (ani) return <AniImage anim={ani} className="m-auto select-none" />;
  return (
    <img
      src={url}
      alt=""
      draggable={false}
      className={cn("select-none object-contain", fit === "height" ? "max-h-full" : "w-auto max-w-full", half ? "max-w-[50%]" : "max-w-full")}
      style={fit === "width" ? { width: half ? "50%" : "min(100%, 1100px)" } : undefined}
    />
  );
}

/** Webtoon mode: one long column, pages load as they approach the viewport. */
function ScrollPages({ src, start, onPage }: { src: PageSource; start: number; onPage: (i: number) => void }) {
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = box.current?.querySelector(`[data-page="${start}"]`);
    el?.scrollIntoView();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    const root = box.current!;
    const io = new IntersectionObserver((entries) => {
      for (const e of entries) if (e.isIntersecting) onPage(Number((e.target as HTMLElement).dataset.page));
    }, { root, threshold: 0.5 });
    root.querySelectorAll("[data-page]").forEach((n) => io.observe(n));
    return () => io.disconnect();
  }, [src, onPage]);
  return (
    <div ref={box} className="flex-1 overflow-y-auto">
      <div className="mx-auto flex max-w-[900px] flex-col">
        {Array.from({ length: src.count }, (_, i) => <LazyPage key={i} src={src} index={i} />)}
      </div>
    </div>
  );
}

function LazyPage({ src, index }: { src: PageSource; index: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    const el = ref.current!;
    const io = new IntersectionObserver(([e]) => {
      if (e.isIntersecting) { void src.url(index).then(setUrl); io.disconnect(); }
    }, { rootMargin: "1500px 0px" });
    io.observe(el);
    return () => io.disconnect();
  }, [src, index]);
  return (
    <div ref={ref} data-page={index} className={cn(!url && "flex aspect-[2/3] items-center justify-center")}>
      {url && aniPages.has(url) ? <AniImage anim={aniPages.get(url)!} className="mx-auto my-8 select-none" /> : url ? <img src={url} alt="" draggable={false} className="block w-full select-none" /> : <Loader2 className="animate-spin text-white/30" size={22} />}
    </div>
  );
}
