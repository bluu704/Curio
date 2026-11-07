import { ChevronRight, Folder, FolderOpen, FolderPlus, Layers, Pencil, Trash2 } from "lucide-react";
import { CustomSwatches } from "@/components/ui/CustomSwatches";
import { FOLDER_COLORS, FOLDER_NAMES, folderColor } from "@/lib/statuses";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { Category, ID, Kind } from "@/api/types";
import { useApp, activeView, viewContext } from "@/store/app";
import { useDrag, startItemDrag, consumeDragClick } from "@/store/drag";
import { cn } from "@/lib/cn";

const LS_OPEN = "curio.catOpen";
const loadOpen = (): Set<string> => { try { return new Set(JSON.parse(localStorage.getItem(LS_OPEN) ?? "[]")); } catch { return new Set(); } };

/** Folder-like category tree for the current archive. Drop cards on a folder to file them. */
export function CategoryTree() {
  const s = useApp();
  const kind: Kind | null = viewContext(activeView(s)).kind ?? null;
  const cats = useMemo(() => s.categories.filter((c) => !kind || c.kind === kind || c.kind === null), [s.categories, kind]);
  const [open, setOpen] = useState<Set<string>>(loadOpen);
  const [editing, setEditing] = useState<ID | null>(null);
  const [menu, setMenu] = useState<{ id: ID; x: number; y: number; confirm?: boolean } | null>(null);
  const overId = useDrag((d) => d.overId);
  const dragging = useDrag((d) => d.ids.length > 0);

  const toggle = (id: string, v?: boolean) => {
    const n = new Set(open);
    if (v ?? !n.has(id)) n.add(id); else n.delete(id);
    setOpen(n);
    try { localStorage.setItem(LS_OPEN, JSON.stringify([...n])); } catch { /* ignore */ }
  };
  const children = (pid: ID | null) => cats.filter((c) => c.parentId === pid).sort((a, b) => a.position - b.position || a.name.localeCompare(b.name, "ko"));

  const add = async (parentId: ID | null) => {
    const c = await s.addCategory("새 폴더", parentId, kind);
    if (parentId) toggle(parentId, true);
    setEditing(c.id);
  };

  /** Drop handler shared by cards and folders. Target "root" = top level. */
  const onDrop = (ids: string[], target: string) => {
    if (ids[0]?.startsWith("cat:")) {
      const c = cats.find((x) => `cat:${x.id}` === ids[0]);
      if (c && c.id !== target) void s.saveCategory({ ...c, parentId: target === "root" ? null : target });
      return;
    }
    if (target !== "root") void s.addToCategory(ids, target);
  };

  const Node = ({ c, depth }: { c: Category; depth: number }) => {
    const kids = children(c.id);
    const isOpen = open.has(c.id);
    const active = s.categoryId === c.id;
    const Icon = active || isOpen ? FolderOpen : Folder;
    return (
      <>
        <div
          data-drop-category={c.id}
          onPointerDown={(e) => editing !== c.id && startItemDrag(e, [`cat:${c.id}`], c.name, onDrop)}
          onClick={() => { if (!consumeDragClick()) s.setCategory(active ? null : c.id); }}
          onDoubleClick={() => setEditing(c.id)}
          onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); setMenu({ id: c.id, x: e.clientX, y: e.clientY }); }}
          className={cn(
            "group/node flex h-8 cursor-pointer items-center gap-1 rounded-lg pr-1 text-[length:calc(13px*var(--ts))] transition-colors",
            // a coloured folder tints its own selection / hover background
            c.color
              ? active ? "bg-[var(--fc-on)] font-medium text-fg" : "text-fg/85 hover:bg-[var(--fc-hover)]"
              : active ? "bg-accent/10 text-accent" : "text-fg/85 hover:bg-subtle",
            dragging && overId === c.id && "bg-accent/20 ring-1 ring-accent",
          )}
          style={{
            paddingLeft: 6 + depth * 14,
            ...(c.color ? { "--fc-on": tint(folderColor(c.color), 0.2), "--fc-hover": tint(folderColor(c.color), 0.11) } as React.CSSProperties : {}),
          }}
        >
          <button
            className={cn("flex h-5 w-5 shrink-0 items-center justify-center rounded text-muted hover:bg-line/60", !kids.length && "invisible")}
            onClick={(e) => { e.stopPropagation(); toggle(c.id); }}
          >
            <ChevronRight size={13} className={cn("transition-transform", isOpen && "rotate-90")} />
          </button>
          <Icon size={15} className="shrink-0" style={{ color: folderColor(c.color) }} fill={c.color ? folderColor(c.color) : "none"} fillOpacity={0.18} />
          {editing === c.id ? (
            <input
              autoFocus
              defaultValue={c.name}
              onClick={(e) => e.stopPropagation()}
              onFocus={(e) => e.currentTarget.select()}
              onBlur={(e) => { const v = e.target.value.trim(); if (v && v !== c.name) void s.saveCategory({ ...c, name: v }); setEditing(null); }}
              onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); if (e.key === "Escape") setEditing(null); }}
              className="input h-6 min-w-0 flex-1 px-1.5"
            />
          ) : (
            <span className="min-w-0 flex-1 truncate pl-0.5">{c.name}</span>
          )}
          <div className="hidden shrink-0 items-center group-hover/node:flex">
            <button className="btn-icon h-6 w-6" data-tip="하위 폴더 만들기" onClick={(e) => { e.stopPropagation(); void add(c.id); }}><FolderPlus size={13} /></button>
            {/* colour, rename and delete live in the right-click menu */}
          </div>
        </div>
        {isOpen && kids.map((k) => <Node key={k.id} c={k} depth={depth + 1} />)}
      </>
    );
  };

  return (
    <div className="flex h-full w-56 shrink-0 flex-col border-r border-line bg-bg">
      <div className="flex h-10 shrink-0 items-center px-3">
        <span className="label flex-1">폴더</span>
        <button className="btn-icon h-7 w-7" data-tip="새 폴더" onClick={() => void add(null)}><FolderPlus size={15} /></button>
      </div>
      <div className="flex-1 overflow-y-auto px-2 pb-4">
        <div
          data-drop-category="root"
          onClick={() => s.setCategory(null)}
          className={cn(
            "flex h-8 cursor-pointer items-center gap-2 rounded-lg px-2 text-[length:calc(13px*var(--ts))]",
            !s.categoryId ? "bg-accent/10 font-medium text-accent" : "text-fg/85 hover:bg-subtle",
            dragging && overId === "root" && "ring-1 ring-accent",
          )}
        >
          <Layers size={15} />전체
        </div>
        {children(null).map((c) => <Node key={c.id} c={c} depth={0} />)}
        {menu && (() => {
          const c = cats.find((x) => x.id === menu.id);
          return c ? <FolderMenu c={c} at={menu} onClose={() => setMenu(null)} onRename={() => setEditing(c.id)} onAdd={() => void add(c.id)} /> : null;
        })()}
        {!cats.length && (
          <div className="mt-3 rounded-lg border border-dashed border-line p-3 text-center text-[length:calc(12px*var(--ts))] leading-relaxed text-muted">
            폴더를 만들고<br />카드를 끌어다 넣어 보세요
          </div>
        )}
      </div>
    </div>
  );
}

/** "#rrggbb" (or any CSS colour) at the given opacity. */
function tint(color: string, alpha: number) {
  const m = /^#([0-9a-f]{6})$/i.exec(color);
  if (!m) return `color-mix(in srgb, ${color} ${Math.round(alpha * 100)}%, transparent)`;
  const n = parseInt(m[1], 16);
  return `rgba(${n >> 16}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}

/** Preset folder colours, the user's own colours, and the wheel for a new one. */
function FolderColorPanel({ c, onDone }: { c: Category; onDone: () => void }) {
  const s = useApp();
  const pick = (color: string | null, close = true) => { void s.saveCategory({ ...c, color }); if (close) onDone(); };
  return (
    <div className="grid grid-cols-6 gap-1.5 p-2.5" onClick={(e) => e.stopPropagation()}>
      {[null, ...FOLDER_COLORS].map((t) => (
        <button key={t ?? "default"} onClick={() => pick(t)} data-tip={t ? FOLDER_NAMES[t] : "기본"}
          className={cn("flex h-7 w-7 items-center justify-center rounded-full ring-offset-2 ring-offset-elevated transition-transform hover:scale-110", (c.color ?? null) === t && "ring-2 ring-fg/60")}
          style={{ background: folderColor(t) }}>
          <Folder size={13} className="text-white" />
        </button>
      ))}
      {/* own colours: picking one keeps this menu open so it can be adjusted */}
      <CustomSwatches value={c.color ?? null} onPick={(hex) => pick(hex, false)} />
    </div>
  );
}

/** Right-click menu of a folder: new sub-folder, rename, colour, delete (asks once more in place). */
function FolderMenu({ c, at, onClose, onRename, onAdd }: {
  c: Category; at: { x: number; y: number; confirm?: boolean }; onClose: () => void; onRename: () => void; onAdd: () => void;
}) {
  const s = useApp();
  const ref = useRef<HTMLDivElement>(null);
  const [sure, setSure] = useState(!!at.confirm);
  const [pos, setPos] = useState({ left: at.x, top: at.y });
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    setPos({ left: Math.max(8, Math.min(at.x, innerWidth - el.offsetWidth - 8)), top: Math.max(8, Math.min(at.y, innerHeight - el.offsetHeight - 8)) });
  }, [at.x, at.y, sure]);
  useEffect(() => {
    // stay open while a colour picker opened from this menu is used
    const down = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node) && !(e.target as HTMLElement).closest?.(".popover")) onClose(); };
    const key = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("mousedown", down);
    document.addEventListener("keydown", key);
    return () => { document.removeEventListener("mousedown", down); document.removeEventListener("keydown", key); };
  }, [onClose]);
  const row = "flex h-8 w-full items-center gap-2 rounded-md px-2 text-left text-[length:calc(13px*var(--ts))] hover:bg-subtle";
  return (
    <div ref={ref} className="popover anim-pop fixed z-[60] w-[232px] p-1" style={pos} onClick={(e) => e.stopPropagation()}>
      <div className="truncate px-2 pb-1 pt-1.5 text-[length:calc(11px*var(--ts))] font-medium text-muted">{c.name}</div>
      <button className={row} onClick={() => { onAdd(); onClose(); }}><FolderPlus size={14} className="text-muted" />하위 폴더 만들기</button>
      <button className={row} onClick={() => { onRename(); onClose(); }}><Pencil size={14} className="text-muted" />이름 바꾸기</button>
      <div className="mx-1 my-1 h-px bg-line" />
      <div className="px-2 pt-1 text-[length:calc(11px*var(--ts))] text-muted">색</div>
      <FolderColorPanel c={c} onDone={onClose} />
      <div className="mx-1 my-1 h-px bg-line" />
      {sure ? (
        <div className="space-y-1.5 p-1.5">
          <div className="text-[length:calc(12px*var(--ts))] leading-snug text-muted">하위 폴더까지 삭제돼요. 항목은 그대로 남아요.</div>
          <div className="flex gap-1.5">
            <button className="btn h-8 flex-1 justify-center border border-line" onClick={() => setSure(false)}>취소</button>
            <button className="btn h-8 flex-1 justify-center bg-danger text-white hover:bg-danger/90" onClick={() => { void s.deleteCategory(c.id); onClose(); }}>삭제</button>
          </div>
        </div>
      ) : (
        <button className={cn(row, "text-danger")} onClick={() => setSure(true)}><Trash2 size={14} />폴더 삭제</button>
      )}
    </div>
  );
}
