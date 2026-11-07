import { Loader2, MicVocal, Pencil, RefreshCw, Trash2 } from "lucide-react";
import { useState } from "react";
import type { Item } from "@/api/types";
import { useApp } from "@/store/app";
import { cn } from "@/lib/cn";

interface Lyrics { plain: string; synced: string; source: string }

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
  const lines = l?.plain.trim().split("\n") ?? [];

  const load = async () => { setBusy(true); try { await fetchLyrics(item.id); } finally { setBusy(false); } };
  const remove = () => { const p = { ...item.props }; delete p._lyrics; void updateItem(item.id, { props: p }); };
  const save = () => {
    const text = (draft ?? "").replace(/\s+$/, "");
    const p = { ...item.props };
    if (!text.trim()) delete p._lyrics;
    // unchanged text keeps the timing / source of the found lyrics
    else p._lyrics = l && text === l.plain.replace(/\s+$/, "") ? l : { plain: text, synced: "", source: "직접 입력" };
    void updateItem(item.id, { props: p });
    setDraft(null);
  };

  return (
    <div className="mt-6 border-t border-line pt-5">
      <div className="mb-2 flex items-center gap-1">
        <div className="label flex-1">가사</div>
        {draft === null && (
          <>
            <button className="btn-icon h-7 w-7" onClick={() => setDraft(l?.plain ?? "")} data-tip={l ? "직접 고치기" : "직접 입력"}><Pencil size={14} /></button>
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
            placeholder="가사를 붙여넣거나 입력하세요"
            rows={10}
            className="input h-auto min-h-40 resize-y py-2 leading-relaxed"
          />
          <div className="flex items-center gap-2">
            <span className="flex-1 text-[length:calc(11px*var(--ts))] text-muted">Ctrl+Enter 저장 · Esc 취소</span>
            <button className="btn h-8 border border-line" onClick={() => setDraft(null)}>취소</button>
            <button className="btn btn-primary h-8" onClick={save}>저장</button>
          </div>
        </div>
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
