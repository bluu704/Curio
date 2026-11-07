import { ChevronRight, Folder, FolderOpen, FolderPlus, Layers, Palette, Pencil, Trash2 } from "lucide-react";
import { Popover } from "@/components/ui/Popover";
import { FOLDER_COLORS, FOLDER_NAMES, folderColor } from "@/lib/statuses";
import { useMemo, useState } from "react";
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
            <button className="btn-icon h-6 w-6" data-tip="하위 폴더" onClick={(e) => { e.stopPropagation(); void add(c.id); }}><FolderPlus size={13} /></button>
            <Popover width={176} trigger={({ toggle }) => (
              <button className="btn-icon h-6 w-6" data-tip="폴더 색" onClick={(e) => { e.stopPropagation(); toggle(); }}><Palette size={12} /></button>
            )}>
              {(close) => (
                <div className="grid grid-cols-5 gap-1.5 p-2" onClick={(e) => e.stopPropagation()}>
                  {[null, ...FOLDER_COLORS].map((t) => (
                    <button key={t ?? "default"} onClick={() => { void s.saveCategory({ ...c, color: t }); close(); }} data-tip={t ? FOLDER_NAMES[t] : "기본"}
                      className={cn("flex h-7 w-7 items-center justify-center rounded-full ring-offset-1 ring-offset-elevated", (c.color ?? null) === t && "ring-2 ring-fg/60")}
                      style={{ background: folderColor(t) }}>
                      <Folder size={13} className="text-white" />
                    </button>
                  ))}
                </div>
              )}
            </Popover>
            <button className="btn-icon h-6 w-6" data-tip="이름 바꾸기" onClick={(e) => { e.stopPropagation(); setEditing(c.id); }}><Pencil size={12} /></button>
            <button className="btn-icon h-6 w-6 hover:text-danger" data-tip="삭제" onClick={(e) => {
              e.stopPropagation();
              if (confirm(`"${c.name}" 폴더와 하위 폴더를 삭제할까요?\n(항목은 삭제되지 않아요)`)) void s.deleteCategory(c.id);
            }}><Trash2 size={12} /></button>
          </div>
        </div>
        {isOpen && kids.map((k) => <Node key={k.id} c={k} depth={depth + 1} />)}
      </>
    );
  };

  return (
    <div className="flex h-full w-56 shrink-0 flex-col border-r border-line bg-bg">
      <div className="flex h-10 shrink-0 items-center px-3">
        <span className="label flex-1">카테고리</span>
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
