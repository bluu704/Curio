import { Loader2, MicVocal, Minus, Pencil, Plus, RefreshCw, Trash2 } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { lineAt, parseLrc } from "@/lib/lrc";
import { playbackNow, usePlayback } from "@/store/playback";
import type { Item } from "@/api/types";
import { useApp } from "@/store/app";
import { cn } from "@/lib/cn";

interface Lyrics { plain: string; synced: string; source: string; offset?: number }
const LRC_STAMP = /^\s*\[\d{1,3}:\d{1,2}(?:[.:]\d{1,3})?\]/gm;

/**
 * 가사: found automatically for songs (YouTube Music → LRCLIB) or on demand, saved with the item.
 * A wrong hit can be fixed or replaced by typing / pasting the lyrics by hand.
 */
export function LyricsSection({ item }: { item: Item }) {
  const { fetchLyrics, updateItem } = useApp();
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<string | null>(null); // non-null = editing
  const l = item.props?._lyrics as Lyrics | undefined;
  const [mode, setMode] = useState<"sync" | "all">("sync");
  const synced = !!l?.synced && mode === "sync";
  const lines = l?.plain.trim().split("\n") ?? [];

  const load = async () => { setBusy(true); try { await fetchLyrics(item.id); } finally { setBusy(false); } };
  const remove = () => { const p = { ...item.props }; delete p._lyrics; void updateItem(item.id, { props: p }); };
  const save = () => {
    const text = (draft ?? "").replace(/\s+$/, "");
    const p = { ...item.props };
    const before = synced ? l?.synced : l?.plain;
    if (!text.trim()) delete p._lyrics;
    // unchanged text keeps the found lyrics as they are
    else if (l && text === before?.replace(/\s+$/, "")) p._lyrics = l;
    // LRC ("[00:12.30]가사") pasted or edited → keeps the timing too
    else if (parseLrc(text).length >= 2) p._lyrics = { plain: text.replace(LRC_STAMP, "").replace(/^\s*\[(?:ar|ti|al|by|offset|length|re|ve):[^\]]*\]\s*$/gim, "").trim(), synced: text, source: "직접 입력", offset: l?.offset };
    else p._lyrics = { plain: text, synced: "", source: "직접 입력" };
    void updateItem(item.id, { props: p });
    setDraft(null);
  };
  const setOffset = (d: number) => {
    if (!l) return;
    const offset = Math.round(((l.offset ?? 0) + d) * 10) / 10;
    void updateItem(item.id, { props: { ...item.props, _lyrics: { ...l, offset } } });
  };

  return (
    <div className="mt-6 border-t border-line pt-5">
      <div className="mb-2 flex items-center gap-1">
        <div className="label flex-1">가사</div>
        {draft === null && l?.synced && (
          <div className="mr-1 flex rounded-lg bg-subtle p-0.5 text-[length:calc(11px*var(--ts))]">
            {(["sync", "all"] as const).map((m) => (
              <button key={m} onClick={() => setMode(m)} className={cn("rounded-md px-2 py-0.5", mode === m ? "bg-surface font-medium text-fg shadow-sm" : "text-muted hover:text-fg")}>
                {m === "sync" ? "따라 부르기" : "전체"}
              </button>
            ))}
          </div>
        )}
        {draft === null && (
          <>
            <button className="btn-icon h-7 w-7" onClick={() => setDraft((synced ? l?.synced : l?.plain) ?? "")} data-tip={l ? (synced ? "싱크 가사 고치기 (LRC)" : "가사 고치기") : "직접 입력"}><Pencil size={14} /></button>
            <button className="btn-icon h-7 w-7" disabled={busy} onClick={() => void load()} data-tip={l ? "다시 불러오기" : "가사 불러오기"}>
              {busy ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
            </button>
            {l && <button className="btn-icon h-7 w-7 hover:text-danger" onClick={remove} data-tip="가사 지우기"><Trash2 size={14} /></button>}
          </>
        )}
      </div>

      {draft !== null ? (
        <div className="space-y-2">
          <textarea
            autoFocus
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Escape") setDraft(null); if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) save(); }}
            placeholder={"가사를 붙여넣거나 입력하세요\n[00:12.30] 처럼 시간을 붙이면 싱크 가사가 돼요"}
            rows={10}
            className="input h-auto min-h-40 resize-y py-2 leading-relaxed"
          />
          <div className="flex items-center gap-2">
            <span className="flex-1 text-[length:calc(11px*var(--ts))] text-muted">Ctrl+Enter 저장 · Esc 취소</span>
            <button className="btn h-8 border border-line" onClick={() => setDraft(null)}>취소</button>
            <button className="btn btn-primary h-8" onClick={save}>저장</button>
          </div>
        </div>
      ) : l && synced ? (
        <SyncedLyrics itemId={item.id} lrc={l.synced} offset={l.offset ?? 0} source={l.source} onOffset={setOffset} />
      ) : l ? (
        <>
          <p className={cn("whitespace-pre-line text-[length:calc(13px*var(--ts))] leading-relaxed text-fg/85", !open && "line-clamp-[8]")}>{l.plain.trim()}</p>
          <div className="mt-1.5 flex items-center gap-2 text-[length:calc(11px*var(--ts))] text-muted">
            {lines.length > 8 && <button className="hover:text-fg" onClick={() => setOpen(!open)}>{open ? "접기" : `전체 보기 (${lines.length}줄)`}</button>}
            <span className="ml-auto">{l.synced ? "싱크 가사 · " : ""}{l.source}</span>
          </div>
        </>
      ) : (
        <div className="flex gap-2">
          <button onClick={() => void load()} disabled={busy}
            className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-dashed border-line px-3 py-3 text-[length:calc(12px*var(--ts))] text-muted hover:bg-subtle">
            {busy ? <Loader2 size={14} className="animate-spin" /> : <MicVocal size={14} />}가사 불러오기
          </button>
          <button onClick={() => setDraft("")}
            className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-dashed border-line px-3 py-3 text-[length:calc(12px*var(--ts))] text-muted hover:bg-subtle">
            <Pencil size={14} />직접 입력
          </button>
        </div>
      )}
    </div>
  );
}

/** Lines follow the song playing in this panel (YouTube or a song file); click a line to jump there. */
function SyncedLyrics({ itemId, lrc, offset, source, onOffset }: { itemId: string; lrc: string; offset: number; source: string; onOffset: (d: number) => void }) {
  const lines = useMemo(() => parseLrc(lrc), [lrc]);
  const live = usePlayback((p) => p.itemId === itemId);
  const playing = usePlayback((p) => p.itemId === itemId && p.playing);
  const seek = usePlayback((p) => (p.itemId === itemId ? p.seek : null));
  const [idx, setIdx] = useState(-1);
  const box = useRef<HTMLDivElement>(null);
  const userScroll = useRef(0);

  useEffect(() => {
    if (!live) { setIdx(-1); return; }
    let raf = 0;
    const tick = () => { setIdx(lineAt(lines, playbackNow() + offset)); raf = requestAnimationFrame(tick); };
    tick();
    return () => cancelAnimationFrame(raf);
  }, [live, lines, offset]);

  // keep the current line in the middle, unless the user just scrolled the lyrics
  useEffect(() => {
    if (idx < 0 || !playing || performance.now() - userScroll.current < 3000) return;
    const el = box.current?.querySelector<HTMLElement>(`[data-line="${idx}"]`);
    const b = box.current;
    if (el && b) b.scrollTo({ top: el.offsetTop - b.clientHeight / 2 + el.clientHeight / 2, behavior: "smooth" });
  }, [idx, playing]);

  return (
    <div>
      <div ref={box} onWheel={() => (userScroll.current = performance.now())} onTouchMove={() => (userScroll.current = performance.now())}
        className="relative max-h-72 overflow-y-auto rounded-xl bg-subtle/60 px-4 py-3 [mask-image:linear-gradient(transparent,#000_12%,#000_88%,transparent)]">
        <div className="h-16" />
        {lines.map((ln, i) => (
          <button key={i} data-line={i} disabled={!seek} onClick={() => seek?.(Math.max(0, ln.t - offset))}
            className={cn("block w-full rounded-md px-1 py-1 text-left leading-snug transition-all duration-300",
              i === idx ? "text-[length:calc(15px*var(--ts))] font-semibold text-fg" : "text-[length:calc(13px*var(--ts))] text-muted",
              seek && "hover:bg-line/40", !ln.text && "h-4")}>
            {ln.text || "♪"}
          </button>
        ))}
        <div className="h-16" />
      </div>
      <div className="mt-1.5 flex items-center gap-1 text-[length:calc(11px*var(--ts))] text-muted">
        <span className="flex-1 truncate">{live ? (playing ? "재생에 맞춰 따라가요 · 줄을 누르면 그 부분으로" : "일시정지됨") : "위에서 노래를 재생하면 가사가 따라가요"}</span>
        <button className="btn-icon h-6 w-6" onClick={() => onOffset(-0.5)} data-tip="가사를 0.5초 늦게"><Minus size={12} /></button>
        <span className="w-12 text-center tabular-nums">{offset > 0 ? "+" : ""}{offset.toFixed(1)}초</span>
        <button className="btn-icon h-6 w-6" onClick={() => onOffset(0.5)} data-tip="가사를 0.5초 빠르게"><Plus size={12} /></button>
        <span className="ml-1">· {source}</span>
      </div>
    </div>
  );
}
