import { CalendarDays, ChevronLeft, ChevronRight, Menu } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { api } from "@/api";
import type { Item } from "@/api/types";
import { useApp } from "@/store/app";
import { cn } from "@/lib/cn";
import { renderInline } from "@/lib/markdown";
import { Cover } from "@/components/ui/Cover";
import { DetailPanel } from "@/components/detail/DetailPanel";

const WEEK = ["일", "월", "화", "수", "목", "금", "토"];
const pad = (n: number) => String(n).padStart(2, "0");
const keyOf = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

/** 캘린더: items on the day they were added + a note per day (saved in the library). */
export function CalendarPage() {
  const s = useApp();
  const [month, setMonth] = useState(() => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1); });
  const [items, setItems] = useState<Item[]>([]);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [sel, setSel] = useState<string>(keyOf(new Date()));

  useEffect(() => {
    void Promise.all([api.listItems({}), api.listItems({ list: "wishlist" })]).then(([a, w]) => {
      const seen = new Set<string>();
      setItems([...a, ...w].filter((i) => !seen.has(i.id) && seen.add(i.id)));
    });
  }, [s.counts]);
  useEffect(() => { void api.getSettings<{ notes: Record<string, string> }>("calendar").then((c) => setNotes(c?.notes ?? {})); }, []);
  const saveNote = (k: string, v: string) => {
    const n = { ...notes };
    if (v.trim()) n[k] = v; else delete n[k];
    setNotes(n);
    void api.setSettings("calendar", { notes: n });
  };

  const byDay = useMemo(() => {
    const m = new Map<string, Item[]>();
    for (const it of items) { const k = keyOf(new Date(it.createdAt)); m.set(k, [...(m.get(k) ?? []), it]); }
    return m;
  }, [items]);

  const y = month.getFullYear(), mo = month.getMonth();
  const first = new Date(y, mo, 1).getDay();
  const days = new Date(y, mo + 1, 0).getDate();
  const cells = Array.from({ length: Math.ceil((first + days) / 7) * 7 }, (_, i) => (i < first || i >= first + days ? null : i - first + 1));
  const today = keyOf(new Date());
  const selItems = byDay.get(sel) ?? [];

  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      <header className="flex h-12 shrink-0 items-center gap-2 border-b border-line px-4 max-md:px-3">
        <button className="btn-icon -ml-2 md:hidden" onClick={() => s.setDrawer(true)} aria-label="메뉴"><Menu size={18} /></button>
        <CalendarDays size={17} className="text-muted max-md:hidden" />
        <h1 className="whitespace-nowrap text-[length:calc(14px*var(--ts))] font-semibold">캘린더</h1>
        <span className="ml-2 whitespace-nowrap text-[length:calc(15px*var(--ts))] font-medium tabular-nums">{y}년 {mo + 1}월</span>
        <div className="flex-1" />
        <button className="btn-icon" onClick={() => setMonth(new Date(y, mo - 1, 1))} data-tip="이전 달"><ChevronLeft size={17} /></button>
        <button className="btn h-8 border border-line" onClick={() => { const d = new Date(); setMonth(new Date(d.getFullYear(), d.getMonth(), 1)); setSel(today); }}>오늘</button>
        <button className="btn-icon" onClick={() => setMonth(new Date(y, mo + 1, 1))} data-tip="다음 달"><ChevronRight size={17} /></button>
      </header>
      <div className="flex min-h-0 flex-1 max-lg:flex-col">
        <div className="min-h-0 flex-1 overflow-auto p-3">
          <div className="grid h-full min-h-[480px] grid-cols-7 gap-px overflow-hidden rounded-xl border border-line bg-line"
            style={{ gridTemplateRows: `auto repeat(${cells.length / 7}, minmax(6rem, 1fr))` }}>
            {WEEK.map((w, i) => (
              <div key={w} className={cn("bg-subtle py-1.5 text-center text-[length:calc(12px*var(--ts))] font-medium", i === 0 && "text-red-500", i === 6 && "text-blue-500")}>{w}</div>
            ))}
            {cells.map((d, i) => {
              if (!d) return <div key={`e${i}`} className="bg-bg/60" />;
              const k = `${y}-${pad(mo + 1)}-${pad(d)}`;
              const list = byDay.get(k) ?? [];
              return (
                <button key={k} onClick={() => setSel(k)}
                  className={cn("flex min-h-24 min-w-0 flex-col items-stretch gap-1 bg-surface p-1.5 text-left hover:bg-subtle/70", sel === k && "ring-2 ring-inset ring-accent")}>
                  <span className={cn("flex h-6 w-6 items-center justify-center self-start rounded-full text-[length:calc(12px*var(--ts))] tabular-nums",
                    k === today && "bg-accent font-semibold text-accent-fg", i % 7 === 0 && k !== today && "text-red-500", i % 7 === 6 && k !== today && "text-blue-500")}>{d}</span>
                  {notes[k] && <span className="line-clamp-2 rounded bg-amber-400/15 px-1 text-[length:calc(11px*var(--ts))] leading-tight text-amber-700 dark:text-amber-300">{renderInline(notes[k])}</span>}
                  {list.slice(0, 3).map((it) => (
                    <span key={it.id} className="flex min-w-0 items-center gap-1 rounded bg-accent/10 px-1 text-[length:calc(11px*var(--ts))] text-accent">
                      <Cover item={it} className="h-3.5 w-2.5 shrink-0 rounded-sm" iconSize={8} /><span className="truncate">{it.title}</span>
                    </span>
                  ))}
                  {list.length > 3 && <span className="px-1 text-[length:calc(11px*var(--ts))] text-muted">+{list.length - 3}</span>}
                </button>
              );
            })}
          </div>
        </div>
        <aside className="w-72 shrink-0 space-y-3 overflow-y-auto border-l border-line p-4 max-lg:w-full max-lg:border-l-0 max-lg:border-t">
          <div className="font-semibold">{Number(sel.slice(5, 7))}월 {Number(sel.slice(8))}일</div>
          <textarea
            key={sel}
            defaultValue={notes[sel] ?? ""}
            onBlur={(e) => saveNote(sel, e.target.value)}
            placeholder="이 날의 메모"
            rows={3}
            className="input h-auto resize-none py-2 leading-relaxed"
          />
          <div className="label">이 날 추가한 항목 · {selItems.length}</div>
          <div className="space-y-1">
            {selItems.map((it) => (
              <button key={it.id} onClick={() => void s.select(it.id)} className="flex w-full items-center gap-2 rounded-lg p-1.5 text-left hover:bg-subtle">
                <Cover item={it} className="h-10 w-7 shrink-0 rounded" iconSize={12} />
                <span className="min-w-0 flex-1 truncate">{it.title}</span>
              </button>
            ))}
          </div>
        </aside>
      </div>
      <DetailPanel />
    </div>
  );
}
