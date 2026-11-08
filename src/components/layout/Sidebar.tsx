import { CalendarDays, ChevronDown, Gift, Monitor, Moon, PanelLeft, Pin, Plus, Settings, Sun, Trash2 } from "lucide-react";
import { useRef, useState } from "react";
import { useApp } from "@/store/app";
import { Logo } from "@/components/ui/Logo";
import { longPress } from "@/store/drag";
import { useTheme } from "@/store/theme";
import { iconOf } from "@/lib/icons";
import { viewIdFor } from "@/lib/kinds";
import { cn } from "@/lib/cn";
import type { ListKind, View } from "@/api/types";

const THEME_ICON = { light: Sun, dark: Moon, system: Monitor } as const;
const THEME_LABEL = { light: "라이트", dark: "다크", system: "시스템" } as const;

export function Sidebar({ drawer }: { drawer?: boolean }) {
  const s = useApp();
  const { views, activeViewId, setView, sidebarExpanded, toggleSidebar, setSettingsOpen, counts, archives, folded, toggleFold, openMenu, setDialog } = s;
  const wide = drawer || sidebarExpanded;
  const { mode, cycle } = useTheme();
  // ---- drag to reorder archives (pointer based; HTML5 DnD is unreliable in the Windows webview)
  const [drag, setDrag] = useState<{ id: string; over: string | null; after: boolean } | null>(null);
  const dragged = useRef(false);
  const dragRef = useRef<typeof drag>(null);
  const startArchiveDrag = (e: React.PointerEvent, id: string) => {
    if (e.button !== 0 || (e.target as HTMLElement).closest("button")) return;
    if (e.pointerType === "touch") {
      longPress(e, (x, y) => openMenu({ x, y, target: { type: "archive", id } }));
      return;
    }
    const sy = e.clientY;
    let active = false;
    const move = (ev: PointerEvent) => {
      if (!active && Math.abs(ev.clientY - sy) < 6) return;
      active = true;
      document.body.style.cursor = "grabbing";
      const row = document.elementFromPoint(ev.clientX, ev.clientY)?.closest("[data-archive-row]") as HTMLElement | null;
      const r = row?.getBoundingClientRect();
      dragRef.current = { id, over: row?.dataset.archiveRow ?? null, after: r ? ev.clientY > r.top + r.height / 2 : false };
      setDrag(dragRef.current);
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      document.body.style.cursor = "";
      if (!active) return;
      dragged.current = true;
      setTimeout(() => (dragged.current = false), 50);
      const d = dragRef.current;
      dragRef.current = null;
      setDrag(null);
      if (d?.over && d.over !== d.id) {
        const ids = useApp.getState().archives.map((a) => a.id).filter((x) => x !== d.id);
        ids.splice(ids.indexOf(d.over) + (d.after ? 1 : 0), 0, d.id);
        void useApp.getState().reorderArchives(ids);
      }
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };
  const ThemeIcon = THEME_ICON[mode];
  const byId = (id: string) => views.find((v) => v.id === id);
  const count = (archiveId: string, list: ListKind) => counts.find((c) => c.archiveId === archiveId && c.list === list)?.count ?? 0;
  const total = counts.filter((c) => c.list === "archive").reduce((a, c) => a + c.count, 0);

  /** One sidebar row. `trailing` sits at the far right (fold button / count). */
  const Row = ({ v, label, icon, n, sub, trailing, onMenu, pinned }: {
    v: View | undefined; label?: string; icon?: string; n?: number; sub?: boolean;
    trailing?: React.ReactNode; onMenu?: (e: React.MouseEvent) => void; pinned?: boolean;
  }) => {
    if (!v) return null;
    const Icon = sub ? Gift : iconOf(icon ?? v.icon);
    const active = v.id === activeViewId;
    const name = label ?? v.name;
    return (
      <div
        role="button"
        tabIndex={0}
        onClick={() => { if (!dragged.current) setView(v.id); }}
        onKeyDown={(e) => e.key === "Enter" && setView(v.id)}
        onContextMenu={onMenu}
        data-tip={wide ? undefined : n !== undefined ? `${name} · ${n}` : name}
        data-tip-side="right"
        className={cn(
          "group flex w-full shrink-0 cursor-pointer items-center gap-2.5 whitespace-nowrap rounded-lg px-2.5 transition-colors",
          sub ? "h-7" : "h-9",
          active ? "bg-accent/10 text-accent" : "text-muted hover:bg-subtle hover:text-fg",
          !wide && "justify-center px-0",
          wide && sub && "pl-8",
        )}
      >
        <Icon size={sub ? 14 : 18} strokeWidth={active ? 2.2 : 1.8} className={cn("shrink-0", sub && !active && "text-pink-500/80")} />
        {wide && (
          <>
            <span className={cn("min-w-0 flex-1 truncate text-left", sub ? "text-[length:calc(12px*var(--ts))]" : "text-[length:calc(13px*var(--ts))] font-medium")}>{name}</span>
            {pinned && <Pin size={11} className="shrink-0 text-muted/60" />}
            {n !== undefined && n > 0 && <span className="text-[length:calc(11px*var(--ts))] tabular-nums text-muted/70">{n}</span>}
            {trailing !== undefined && <span className="flex w-5 shrink-0 justify-center">{trailing}</span>}
          </>
        )}
      </div>
    );
  };

  return (
    <aside className={cn("flex h-full shrink-0 flex-col border-r border-line bg-surface transition-[width] duration-200",
      drawer ? "w-72 max-w-[85vw] shadow-pop" : wide ? "w-56" : "w-[60px]")}>
      <div className={cn("flex h-12 shrink-0 items-center gap-2 px-3", !wide && "justify-center px-0")}>
        <Logo size={32} />
        {wide && <span className="flex-1 whitespace-nowrap text-[length:calc(15px*var(--ts))] font-semibold tracking-tight">Curio</span>}
      </div>

      <nav className="flex flex-1 flex-col gap-0.5 overflow-y-auto overflow-x-hidden px-2.5 py-2">
        <Row v={byId("sys:all")} n={total} trailing={null} />
        <Row v={byId("sys:fav")} trailing={null} />
        <button
          onClick={() => setView("sys:calendar")}
          data-tip={wide ? undefined : "캘린더"}
          data-tip-side="right"
          className={cn("flex h-9 w-full shrink-0 items-center gap-2.5 whitespace-nowrap rounded-lg px-2.5 transition-colors",
            activeViewId === "sys:calendar" ? "bg-accent/10 text-accent" : "text-muted hover:bg-subtle hover:text-fg", !wide && "justify-center px-0")}
        >
          <CalendarDays size={18} strokeWidth={activeViewId === "sys:calendar" ? 2.2 : 1.8} className="shrink-0" />
          {wide && <span className="flex-1 text-left text-[length:calc(13px*var(--ts))] font-medium">캘린더</span>}
        </button>
        <div className="mx-1 my-2 h-px shrink-0 bg-line" />
        {wide && (
          <div className="flex items-center pb-1 pl-2.5 pr-1">
            <span className="label flex-1">아카이브</span>
            <button className="btn-icon h-6 w-6" onClick={() => setDialog({ type: "archive", archiveId: null })} data-tip="아카이브 추가"><Plus size={14} /></button>
          </div>
        )}
        {archives.map((a) => {
          const wishId = viewIdFor(a.id, "wishlist");
          const wishN = count(a.id, "wishlist");
          const hasWish = wishN > 0 || activeViewId === wishId;
          const isFolded = folded.has(a.id);
          return (
            <div key={a.id} data-archive-row={a.id} onPointerDown={(e) => startArchiveDrag(e, a.id)}
              className={cn("relative flex flex-col gap-0.5", drag?.id === a.id && "opacity-40")}>
              {drag && drag.over === a.id && drag.id !== a.id && (
                <div className={cn("pointer-events-none absolute inset-x-1 z-10 h-0.5 rounded-full bg-accent", drag.after ? "-bottom-px" : "-top-px")} />
              )}
              <Row
                v={byId(viewIdFor(a.id, "archive"))}
                label={a.name}
                icon={a.icon}
                n={count(a.id, "archive")}
                pinned={a.pinned}
                onMenu={(e) => { e.preventDefault(); openMenu({ x: e.clientX, y: e.clientY, target: { type: "archive", id: a.id } }); }}
                trailing={hasWish ? (
                  <button
                    className="flex h-5 w-5 items-center justify-center rounded text-muted/70 hover:bg-line/60 hover:text-fg"
                    onClick={(e) => { e.stopPropagation(); toggleFold(a.id); }}
                    data-tip={isFolded ? "위시리스트 펼치기" : "위시리스트 접기"}
                  >
                    <ChevronDown size={13} className={cn("transition-transform", isFolded && "-rotate-90")} />
                  </button>
                ) : null}
              />
              {/* wishlist rows only in the wide sidebar, hidden while empty or folded */}
              {wide && hasWish && !isFolded && <Row v={byId(wishId)} label="위시리스트" n={wishN} sub trailing={null} />}
            </div>
          );
        })}
        {!wide && (
          <button onClick={() => setDialog({ type: "archive", archiveId: null })} data-tip="아카이브 추가" data-tip-side="right"
            className="flex h-9 w-full shrink-0 items-center justify-center rounded-lg text-muted/80 hover:bg-subtle hover:text-fg">
            <Plus size={18} strokeWidth={1.8} />
          </button>
        )}
        <div className="mx-1 my-2 h-px shrink-0 bg-line" />
        <button
          onClick={() => setView("sys:trash")}
          data-tip={wide ? undefined : `휴지통 · ${s.trashCount}`}
          data-tip-side="right"
          className={cn("flex h-9 w-full shrink-0 items-center gap-2.5 whitespace-nowrap rounded-lg px-2.5 transition-colors",
            activeViewId === "sys:trash" ? "bg-accent/10 text-accent" : "text-muted hover:bg-subtle hover:text-fg", !wide && "justify-center px-0")}
        >
          <Trash2 size={18} strokeWidth={1.8} className="shrink-0" />
          {wide && <span className="flex-1 text-left text-[length:calc(13px*var(--ts))] font-medium">휴지통</span>}
          {wide && s.trashCount > 0 && <span className="mr-5 text-[length:calc(11px*var(--ts))] tabular-nums text-muted/70">{s.trashCount}</span>}
        </button>
      </nav>

      <div className={cn("flex gap-1 border-t border-line p-2.5", wide ? "flex-row" : "flex-col items-center")}>
        <button className="btn-icon" onClick={cycle} data-tip={`테마: ${THEME_LABEL[mode]}`} data-tip-side={wide ? "top" : "right"}>
          <ThemeIcon size={17} />
        </button>
        <button className="btn-icon" onClick={() => setSettingsOpen(true)} data-tip="설정" data-tip-side={wide ? "top" : "right"}>
          <Settings size={17} />
        </button>
        <button className={cn("btn-icon", wide && "ml-auto", drawer && "hidden")} onClick={toggleSidebar} data-tip={wide ? "메뉴 접기" : "메뉴 펼치기"} data-tip-side={wide ? "top" : "right"}>
          <PanelLeft size={17} />
        </button>
      </div>
    </aside>
  );
}
