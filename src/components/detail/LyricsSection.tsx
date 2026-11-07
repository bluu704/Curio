import { Loader2, MicVocal, RefreshCw, Trash2 } from "lucide-react";
import { useState } from "react";
import type { Item } from "@/api/types";
import { useApp } from "@/store/app";
import { cn } from "@/lib/cn";

interface Lyrics { plain: string; synced: string; source: string }

/** 가사: found automatically for songs (YouTube Music → LRCLIB) or on demand. */
export function LyricsSection({ item }: { item: Item }) {
  const { fetchLyrics, updateItem } = useApp();
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);
  const l = item.props?._lyrics as Lyrics | undefined;
  const load = async () => { setBusy(true); try { await fetchLyrics(item.id); } finally { setBusy(false); } };
  const remove = () => { const p = { ...item.props }; delete p._lyrics; void updateItem(item.id, { props: p }); };
  const lines = l?.plain.trim().split("\n") ?? [];

  return (
    <div className="mt-6 border-t border-line pt-5">
      <div className="mb-2 flex items-center gap-1">
        <div className="label flex-1">가사</div>
        {l && <button className="btn-icon h-7 w-7" disabled={busy} onClick={() => void load()} data-tip="다시 불러오기">{busy ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}</button>}
        {l && <button className="btn-icon h-7 w-7 hover:text-danger" onClick={remove} data-tip="가사 지우기"><Trash2 size={14} /></button>}
      </div>
      {l ? (
        <>
          <p className={cn("whitespace-pre-line text-[length:calc(13px*var(--ts))] leading-relaxed text-fg/85", !open && "line-clamp-[8]")}>{l.plain.trim()}</p>
          <div className="mt-1.5 flex items-center gap-2 text-[length:calc(11px*var(--ts))] text-muted">
            {lines.length > 8 && <button className="hover:text-fg" onClick={() => setOpen(!open)}>{open ? "접기" : `전체 보기 (${lines.length}줄)`}</button>}
            <span className="ml-auto">{l.synced ? "싱크 가사 · " : ""}{l.source}</span>
          </div>
        </>
      ) : (
        <button onClick={() => void load()} disabled={busy}
          className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-line px-3 py-3 text-[length:calc(12px*var(--ts))] text-muted hover:bg-subtle">
          {busy ? <Loader2 size={14} className="animate-spin" /> : <MicVocal size={14} />}가사 불러오기
        </button>
      )}
    </div>
  );
}
