import { ChevronLeft, ChevronRight, ImagePlus, Link as LinkIcon, Play, Trash2 } from "lucide-react";
import { useState } from "react";
import { api } from "@/api";
import type { Block } from "@/api/types";
import { cn } from "@/lib/cn";
import { renderInline } from "@/lib/markdown";

type Patch = (p: Partial<Block>) => void;
const str = (v: unknown) => (typeof v === "string" ? v : "");

/** Default data when a rich block is created. */
export function richDefaults(type: Block["type"]): Partial<Block> {
  const now = new Date();
  if (type === "toggle") return { data: { open: true, body: "" } };
  if (type === "calendar") return { data: { month: `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`, notes: {} } };
  if (type === "image" || type === "video" || type === "bookmark") return { data: {} };
  return {};
}

export const RICH_TYPES = ["toggle", "image", "video", "bookmark", "calendar", "toc"] as const;

export function RichBlock({ block, onPatch, all }: { block: Block; onPatch: Patch; all: Block[] }) {
  switch (block.type) {
    case "toggle": return <ToggleBlock block={block} onPatch={onPatch} />;
    case "image": return <ImageBlock block={block} onPatch={onPatch} />;
    case "video": return <VideoBlock block={block} onPatch={onPatch} />;
    case "bookmark": return <BookmarkBlock block={block} onPatch={onPatch} />;
    case "calendar": return <CalendarBlock block={block} onPatch={onPatch} />;
    case "toc": return <TocBlock all={all} />;
    default: return null;
  }
}

const setData = (b: Block, onPatch: Patch, p: Record<string, unknown>) => onPatch({ data: { ...b.data, ...p } });

function ToggleBlock({ block, onPatch }: { block: Block; onPatch: Patch }) {
  const open = block.data?.open !== false;
  return (
    <div className="py-0.5">
      <div className="flex items-center gap-1">
        <button className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-muted hover:bg-subtle" onClick={() => setData(block, onPatch, { open: !open })}>
          <ChevronRight size={15} className={cn("transition-transform", open && "rotate-90")} />
        </button>
        <input className="h-7 min-w-0 flex-1 bg-transparent font-medium outline-none placeholder:text-muted/40" placeholder="토글 제목" value={block.text} onChange={(e) => onPatch({ text: e.target.value })} />
      </div>
      {open && (
        <textarea
          className="ml-7 block w-[calc(100%-1.75rem)] resize-none overflow-hidden bg-transparent py-1 leading-relaxed outline-none placeholder:text-muted/40"
          placeholder="내용"
          rows={Math.max(1, str(block.data?.body).split("\n").length)}
          value={str(block.data?.body)}
          onChange={(e) => setData(block, onPatch, { body: e.target.value })}
        />
      )}
    </div>
  );
}

function ImageBlock({ block, onPatch }: { block: Block; onPatch: Patch }) {
  const src = str(block.data?.src);
  const [url, setUrl] = useState("");
  const upload = (f: File) => {
    const img = new window.Image();
    img.onload = () => {
      const k = Math.min(1, 1600 / Math.max(img.width, img.height));
      const c = Object.assign(document.createElement("canvas"), { width: img.width * k, height: img.height * k });
      c.getContext("2d")!.drawImage(img, 0, 0, c.width, c.height);
      setData(block, onPatch, { src: c.toDataURL("image/jpeg", 0.88) });
    };
    img.src = URL.createObjectURL(f);
  };
  if (!src) {
    return (
      <div className="my-1 flex flex-wrap items-center gap-2 rounded-lg border border-dashed border-line p-3">
        <label className="btn h-8 cursor-pointer border border-line"><ImagePlus size={14} />이미지 올리기
          <input type="file" accept="image/*" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) upload(f); }} />
        </label>
        <input className="input h-8 min-w-40 flex-1" placeholder="또는 이미지 주소" value={url} onChange={(e) => setUrl(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && url.trim() && setData(block, onPatch, { src: url.trim() })} />
      </div>
    );
  }
  return (
    <figure className="group/img relative my-1">
      <img src={api.mediaUrl(src) ?? src} alt={block.text} className="max-h-[480px] max-w-full rounded-lg" referrerPolicy="no-referrer" />
      <button className="touch-show absolute right-2 top-2 hidden h-7 w-7 items-center justify-center rounded-md bg-black/50 text-white group-hover/img:flex" onClick={() => setData(block, onPatch, { src: "" })} data-tip="이미지 지우기"><Trash2 size={13} /></button>
      <input className="mt-1 w-full bg-transparent text-center text-[length:calc(12px*var(--ts))] text-muted outline-none placeholder:text-muted/40" placeholder="설명" value={block.text} onChange={(e) => onPatch({ text: e.target.value })} />
    </figure>
  );
}

const ytId = (u: string) => u.match(/(?:v=|youtu\.be\/|shorts\/|embed\/)([A-Za-z0-9_-]{11})/)?.[1] ?? null;

function VideoBlock({ block, onPatch }: { block: Block; onPatch: Patch }) {
  const url = str(block.data?.url);
  const [draft, setDraft] = useState("");
  if (!url) {
    return (
      <input className="input my-1 h-9" placeholder="YouTube 또는 영상 파일 주소 (Enter)" value={draft} onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && draft.trim() && setData(block, onPatch, { url: draft.trim() })} />
    );
  }
  const yt = ytId(url);
  return (
    <div className="group/vid relative my-1 overflow-hidden rounded-lg bg-black">
      {yt && api.caps.platform !== "mock" ? (
        <iframe className="aspect-video w-full" src={`https://www.youtube-nocookie.com/embed/${yt}`} allow="encrypted-media; picture-in-picture" allowFullScreen title="video" />
      ) : yt ? (
        <a href={url} target="_blank" rel="noreferrer" className="relative block">
          <img src={`https://i.ytimg.com/vi/${yt}/hqdefault.jpg`} alt="" className="aspect-video w-full object-cover opacity-80" />
          <span className="absolute inset-0 m-auto flex h-12 w-12 items-center justify-center rounded-full bg-red-600 text-white"><Play size={20} fill="currentColor" /></span>
        </a>
      ) : (
        <video src={url} controls className="w-full" />
      )}
      <button className="touch-show absolute right-2 top-2 hidden h-7 w-7 items-center justify-center rounded-md bg-black/50 text-white group-hover/vid:flex" onClick={() => setData(block, onPatch, { url: "" })} data-tip="지우기"><Trash2 size={13} /></button>
    </div>
  );
}

function BookmarkBlock({ block, onPatch }: { block: Block; onPatch: Patch }) {
  const url = str(block.data?.url);
  const [draft, setDraft] = useState("");
  if (!url) {
    return (
      <input className="input my-1 h-9" placeholder="북마크할 주소 (Enter)" value={draft} onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && draft.trim() && setData(block, onPatch, { url: /^https?:/.test(draft.trim()) ? draft.trim() : `https://${draft.trim()}` })} />
    );
  }
  let host = url;
  try { host = new URL(url).hostname.replace(/^www\./, ""); } catch { /* keep raw */ }
  return (
    <div className="group/bm my-1 flex items-center gap-3 rounded-lg border border-line p-3 hover:bg-subtle">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-subtle text-muted"><LinkIcon size={16} /></span>
      <div className="min-w-0 flex-1">
        <input className="w-full bg-transparent font-medium outline-none placeholder:text-muted/50" placeholder={host} value={block.text} onChange={(e) => onPatch({ text: e.target.value })} />
        <a href={url} target="_blank" rel="noreferrer" className="block truncate text-[length:calc(12px*var(--ts))] text-accent hover:underline">{url}</a>
      </div>
      <button className="btn-icon touch-show h-7 w-7 opacity-0 group-hover/bm:opacity-100" onClick={() => setData(block, onPatch, { url: "" })} data-tip="주소 바꾸기"><Trash2 size={13} /></button>
    </div>
  );
}

const WEEK = ["일", "월", "화", "수", "목", "금", "토"];
const pad = (n: number) => String(n).padStart(2, "0");

/** Month calendar. Click a day to write a short note for it. */
function CalendarBlock({ block, onPatch }: { block: Block; onPatch: Patch }) {
  const month = str(block.data?.month) || `${new Date().getFullYear()}-${pad(new Date().getMonth() + 1)}`;
  const notes = (block.data?.notes ?? {}) as Record<string, string>;
  const [y, m] = month.split("-").map(Number);
  const first = new Date(y, m - 1, 1).getDay();
  const days = new Date(y, m, 0).getDate();
  const today = new Date();
  const todayKey = `${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`;
  const [sel, setSel] = useState<string | null>(null);
  const shift = (d: number) => { const t = new Date(y, m - 1 + d, 1); setData(block, onPatch, { month: `${t.getFullYear()}-${pad(t.getMonth() + 1)}` }); setSel(null); };
  const cells = Array.from({ length: first + days }, (_, i) => (i < first ? null : i - first + 1));
  return (
    <div className="my-1 rounded-xl border border-line p-3">
      <div className="mb-2 flex items-center gap-1">
        <span className="flex-1 font-semibold">{y}년 {m}월</span>
        <button className="btn-icon h-7 w-7" onClick={() => shift(-1)} data-tip="이전 달"><ChevronLeft size={15} /></button>
        <button className="btn h-7 px-2 text-[length:calc(12px*var(--ts))]" onClick={() => { setData(block, onPatch, { month: todayKey.slice(0, 7) }); setSel(todayKey); }}>오늘</button>
        <button className="btn-icon h-7 w-7" onClick={() => shift(1)} data-tip="다음 달"><ChevronRight size={15} /></button>
      </div>
      <div className="grid grid-cols-7 gap-px overflow-hidden rounded-lg bg-line text-[length:calc(12px*var(--ts))]">
        {WEEK.map((w, i) => <div key={w} className={cn("bg-subtle py-1 text-center font-medium", i === 0 && "text-red-500", i === 6 && "text-blue-500")}>{w}</div>)}
        {cells.map((d, i) => {
          if (!d) return <div key={`e${i}`} className="min-h-14 bg-surface" />;
          const key = `${month}-${pad(d)}`;
          const note = notes[key];
          return (
            <button key={key} onClick={() => setSel(sel === key ? null : key)}
              className={cn("flex min-h-14 flex-col items-start gap-0.5 bg-surface p-1 text-left hover:bg-subtle", sel === key && "ring-2 ring-inset ring-accent")}>
              <span className={cn("flex h-5 min-w-5 items-center justify-center rounded-full px-1 tabular-nums", key === todayKey && "bg-accent text-accent-fg", i % 7 === 0 && key !== todayKey && "text-red-500", i % 7 === 6 && key !== todayKey && "text-blue-500")}>{d}</span>
              {note && <span className="line-clamp-2 w-full rounded bg-accent/10 px-1 text-[length:calc(11px*var(--ts))] leading-tight text-accent">{renderInline(note)}</span>}
            </button>
          );
        })}
      </div>
      {sel && (
        <div className="mt-2 flex items-center gap-2">
          <span className="shrink-0 text-[length:calc(12px*var(--ts))] text-muted">{Number(sel.slice(5, 7))}월 {Number(sel.slice(8))}일</span>
          <input autoFocus className="input h-8 flex-1" placeholder="이 날의 메모" value={notes[sel] ?? ""}
            onChange={(e) => { const n = { ...notes }; if (e.target.value) n[sel] = e.target.value; else delete n[sel]; setData(block, onPatch, { notes: n }); }}
            onKeyDown={(e) => e.key === "Enter" && setSel(null)} />
        </div>
      )}
    </div>
  );
}

/** Table of contents of this memo's headings. */
function TocBlock({ all }: { all: Block[] }) {
  const heads = all.filter((b) => (b.type === "h1" || b.type === "heading" || b.type === "h3") && b.text.trim());
  if (!heads.length) return <div className="my-1 rounded-lg bg-subtle px-3 py-2 text-[length:calc(12px*var(--ts))] text-muted">목차 · 제목 블록을 추가하면 여기에 나타나요</div>;
  return (
    <nav className="my-1 space-y-0.5 rounded-lg bg-subtle/60 px-3 py-2">
      {heads.map((h) => (
        <button key={h.id} onClick={() => document.querySelector(`[data-block-id="${h.id}"]`)?.scrollIntoView({ behavior: "smooth", block: "center" })}
          className={cn("block w-full truncate text-left text-accent hover:underline", h.type === "heading" && "pl-4", h.type === "h3" && "pl-8")}>
          {h.text}
        </button>
      ))}
    </nav>
  );
}

/** Native date picker → "YYYY-MM-DD" (null if dismissed). */
export function pickDate(): Promise<string | null> {
  return new Promise((res) => {
    const i = Object.assign(document.createElement("input"), { type: "date", value: new Date().toISOString().slice(0, 10) });
    i.style.cssText = "position:fixed;opacity:0;pointer-events:none;left:50%;top:50%";
    document.body.appendChild(i);
    const done = (v: string | null) => { i.remove(); res(v); };
    i.addEventListener("change", () => done(i.value || null));
    i.addEventListener("blur", () => setTimeout(() => i.isConnected && done(null), 300));
    try { (i as HTMLInputElement & { showPicker?: () => void }).showPicker?.(); } catch { done(i.value); }
    i.focus();
  });
}
