import { CircleAlert, CircleCheck, ClipboardCopy, Loader2 } from "lucide-react";
import { Select } from "@/components/ui/Select";
import { iconOf } from "@/lib/icons";
import { archiveKind } from "@/lib/itemFlags";
import { useEffect, useMemo, useState } from "react";
import type { ListKind } from "@/api/types";
import { activeView, useApp, viewContext } from "@/store/app";
import { columnNames, parseStrict, statusWords, templateFor } from "@/lib/strictImport";
import { cn } from "@/lib/cn";
import { Modal } from "@/components/ui/Modal";

const example = (header: string, song: boolean) => song ? `${header}
밤편지 | 완료 | 5 | 아이유 | 발라드 | 최애 | https://music.youtube.com/watch?v=… |
Supernova | 감상중 | | aespa` : `${header}
장송의 프리렌 | 완료 | 5 | 야마다 카네히토, 아베 츠카사 | 판타지 | 명작 | | 최애
약사의 혼잣말 | 감상중`;

/** Fixed-format bulk import (see lib/strictImport.ts for the rules). */
export function ImportDialog() {
  const s = useApp();
  const ctx = viewContext(activeView(s));
  const [arcId, setArcId] = useState<string>("");
  const [list, setList] = useState<ListKind>(ctx.list ?? "archive");
  const [text, setText] = useState("");
  const [fill, setFill] = useState(true);
  const [progress, setProgress] = useState<string | null>(null);
  const archive = s.archives.find((a) => a.id === arcId) ?? s.archives[0];
  const kind = archiveKind(archive);
  const rows = useMemo(() => parseStrict(text, kind, list), [text, kind, list]);
  const open = s.dialog?.type === "import";
  // the archive being looked at (falls back to the first one)
  useEffect(() => { if (open) { setArcId(ctx.archiveId ?? s.archives[0]?.id ?? ""); setList(ctx.list ?? "archive"); } }, [open, ctx.archiveId, ctx.list]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!open) return null;

  const ok = rows.filter((r) => r.item);
  const bad = rows.filter((r) => !r.item);
  const cols = columnNames(archive?.id);
  const template = templateFor(archive?.id);

  const run = async () => {
    setProgress(`${ok.length}개 추가 중…`);
    const ids = await s.bulkCreate(ok.map((r) => ({ ...r.item!, archiveId: archive?.id, kind })));
    if (fill && kind !== "doujin") {
      const hit = await s.autofill(ids, (done, h) => setProgress(`정보 검색 중 ${done}/${ids.length} (찾음 ${h})`));
      s.notify(`${ids.length}개 추가 · ${hit}개 정보 자동 입력`);
    } else s.notify(`${ids.length}개 추가했어요`);
    setProgress(null);
    setText("");
    s.setDialog(null);
  };

  return (
    <Modal open onClose={() => !progress && s.setDialog(null)} title="목록 붙여넣기로 가져오기" width={860}>
      <div className="flex flex-wrap items-center gap-2">
        <Select className="h-8 w-36" value={archive?.id ?? ""} onChange={setArcId} options={s.archives.map((a) => ({ value: a.id, label: a.name, icon: iconOf(a.icon) }))} />
        <Select className="h-8 w-32" value={list} onChange={setList} options={[{ value: "archive", label: "아카이브" }, { value: "wishlist", label: "위시리스트" }]} />
        <button className="btn ml-auto border border-line" onClick={() => void navigator.clipboard?.writeText(template)}><ClipboardCopy size={14} />템플릿 복사</button>
      </div>

      <div className="mt-3 rounded-xl bg-subtle p-3 text-[length:calc(12px*var(--ts))] leading-relaxed text-muted">
        <div className="mb-1 font-mono text-[length:calc(12px*var(--ts))] text-fg">{cols.map((c, i) => <span key={i}>{i > 0 && <span className="text-muted"> | </span>}{c}</span>)}</div>
        한 줄에 하나 · <b className="text-fg">|</b> 또는 <b className="text-fg">Tab</b>으로 구분 · 제목만 필수
      </div>

      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          // Tab types a column separator instead of leaving the box
          if (e.key !== "Tab" || e.shiftKey) return;
          e.preventDefault();
          const el = e.currentTarget, a = el.selectionStart, b = el.selectionEnd;
          setText(text.slice(0, a) + "\t" + text.slice(b));
          requestAnimationFrame(() => { el.selectionStart = el.selectionEnd = a + 1; });
        }}
        spellCheck={false}
        placeholder={example(template, kind === "music")}
        className="mt-3 h-44 w-full resize-y rounded-xl border border-line bg-surface p-3 font-mono text-[length:calc(12px*var(--ts))] leading-relaxed outline-none focus:border-accent/60"
      />

      {rows.length > 0 && (
        <div className="mt-3 max-h-56 overflow-y-auto rounded-xl border border-line">
          {rows.map((r) => (
            <div key={r.line} className={cn("flex items-start gap-2 border-b border-line/60 px-3 py-1.5 text-[length:calc(12px*var(--ts))] last:border-0", !r.item && "bg-danger/5")}>
              <span className="w-8 shrink-0 text-right font-mono text-muted">{r.line}</span>
              {r.item ? <CircleCheck size={14} className="mt-0.5 shrink-0 text-green-500" /> : <CircleAlert size={14} className="mt-0.5 shrink-0 text-danger" />}
              {r.item ? (
                <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">
                  <span className="font-medium">{r.item.title}</span>
                  {r.item.status && <span className="chip h-5 text-[length:calc(11px*var(--ts))]">{Object.entries(statusWords()).find(([, v]) => v === r.item!.status)?.[0]}</span>}
                  {r.item.rating != null && <span className="chip h-5 text-[length:calc(11px*var(--ts))]">★ {r.item.rating}</span>}
                  {r.item.tags?.map((t) => <span key={t.category + t.name} className="chip h-5 text-[length:calc(11px*var(--ts))] text-muted">{t.name}</span>)}
                  {(r.item.url || r.item.code) && <span className="truncate text-muted">{r.item.code ?? r.item.url}</span>}
                </div>
              ) : (
                <div className="min-w-0 flex-1 text-danger">{r.errors.join(" · ")}<div className="truncate font-mono text-muted">{r.raw}</div></div>
              )}
            </div>
          ))}
        </div>
      )}

      <div className="mt-4 flex items-center gap-3">
        {kind !== "doujin" && (
          <label className="flex cursor-pointer items-center gap-1.5 text-[length:calc(12px*var(--ts))] text-muted">
            <input type="checkbox" checked={fill} onChange={(e) => setFill(e.target.checked)} className="accent-[rgb(var(--accent))]" />
            가져온 뒤 제목으로 정보·이미지 자동 검색 (확실히 일치할 때만 적용)
          </label>
        )}
        <span className="ml-auto text-[length:calc(12px*var(--ts))] text-muted">{bad.length > 0 && <span className="text-danger">오류 {bad.length}줄 제외 · </span>}{ok.length}개</span>
        <button className="btn btn-primary" disabled={!ok.length || !!progress} onClick={() => void run()}>
          {progress ? <><Loader2 size={15} className="animate-spin" />{progress}</> : "가져오기"}
        </button>
      </div>
    </Modal>
  );
}
