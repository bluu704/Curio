import { ChevronRight, Folder, FolderOpen, FolderPlus, Layers, Pencil, Trash2 } from "lucide-react";
import { CustomSwatches } from "@/components/ui/CustomSwatches";
import { FOLDER_COLORS, FOLDER_NAMES, folderColor } from "@/lib/statuses";
import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { useOnScreen } from "@/lib/onScreen";
import type { Archive, Category, ID } from "@/api/types";
import { iconOf } from "@/lib/icons";
import { dropItems } from "@/components/views/dragDrop";
import { CloudRow } from "@/components/menus/ContextMenu";
import { useApp, activeView, viewContext } from "@/store/app";
import { useDrag, startItemDrag, consumeDragClick } from "@/store/drag";
import { cn } from "@/lib/cn";

const LS_OPEN = "curio.catOpen";
const loadOpen = (): Set<string> => { try { return new Set(JSON.parse(localStorage.getItem(LS_OPEN) ?? "[]")); } catch { return new Set(); } };

/**
 * Folder tree. In an archive: that archive's folders. Elsewhere (전체, 즐겨찾기): every archive as a
 * top-level node with its folders inside. Drop cards on a folder to file them, on an archive to move them.
 */
export function CategoryTree() {
  const s = useApp();
  const arcId: ID | null = viewContext(activeView(s)).archiveId ?? null;
  const cats = useMemo(() => (arcId ? s.categories.filter((c) => c.archiveId === arcId) : s.categories), [s.categories, arcId]);
  const live = new Set(s.archives.map((a) => a.id));
  /** folders whose archive is gone / unknown sit at the top level of the overview */
  const orphan = (c: Category) => !c.archiveId || !live.has(c.archiveId);
  const [open, setOpen] = useState<Set<string>>(loadOpen);
  const [editing, setEditing] = useState<ID | null>(null);
  // F2 on a selected folder
  const renameId = useApp((st) => st.renameFolderId);
  useEffect(() => { if (renameId) { setEditing(renameId); useApp.setState({ renameFolderId: null }); } }, [renameId]);
  const [menu, setMenu] = useState<{ id: ID; x: number; y: number } | null>(null);
  const overId = useDrag((d) => d.overId);
  const dragging = useDrag((d) => d.ids.length > 0);
  const zone = useDrag((d) => d.zone);

  const toggle = (id: string, v?: boolean) => {
    const n = new Set(open);
    if (v ?? !n.has(id)) n.add(id); else n.delete(id);
    setOpen(n);
    try { localStorage.setItem(LS_OPEN, JSON.stringify([...n])); } catch { /* ignore */ }
  };
  const sorted = (l: Category[]) => l.sort((a, b) => a.position - b.position || a.name.localeCompare(b.name, "ko", { numeric: true }));
  const children = (pid: ID | null) => sorted(cats.filter((c) => c.parentId === pid && (pid || arcId || orphan(c))));
  const archiveRoots = (a: Archive) => sorted(cats.filter((c) => c.parentId === null && c.archiveId === a.id));

  const add = async (parentId: ID | null, archiveId: ID | null = arcId) => {
    const c = await s.addCategory("새 폴더", parentId, archiveId);
    if (parentId) toggle(parentId, true);
    else if (archiveId && !arcId) toggle(`arc:${archiveId}:closed`, false);
    setEditing(c.id);
  };

  /** Drop handler shared by cards and folders. Target "root" = top level, "arc:<id>" = an archive node. */
  const onDrop = (ids: string[], target: string, zone?: "before" | "after" | "into" | null) => {
    const toArchive = target.startsWith("arc:") ? target.slice(4) : null;
    if (ids[0]?.startsWith("cat:")) {
      const c = s.categories.find((x) => `cat:${x.id}` === ids[0]);
      if (!c || c.id === target) return;
      // a folder's top / bottom edge: reorder; its middle: put inside
      if (zone === "before" || zone === "after") { void s.placeCategory(c.id, target, zone); return; }
      if (toArchive) void s.moveCategory(c.id, null, toArchive);
      else if (target === "root") void s.moveCategory(c.id, null, arcId ?? c.archiveId ?? null);
      else { const t = s.categories.find((x) => x.id === target); if (t) void s.moveCategory(c.id, t.id, t.archiveId ?? null); }
      return;
    }
    dropItems(ids, target);
  };

  // plain render functions, not inner components: an inner component is a new type on every render, so
  // React would remount it — and a folder's rename box would lose what was being typed
  const archiveNode = (a: Archive) => {
    const key = `arc:${a.id}`;
    const kids = archiveRoots(a);
    const isOpen = !open.has(`${key}:closed`); // archives start unfolded
    const Icon = iconOf(a.icon);
    return (
      <Fragment key={key}>
        <div
          data-drop-category={key}
          onClick={() => s.setView(key)}
          onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); s.openMenu({ x: e.clientX, y: e.clientY, target: { type: "archive", id: a.id } }); }}
          className={cn(
            "group/node flex h-8 cursor-pointer items-center gap-1 rounded-lg pr-1 text-[length:calc(13px*var(--ts))] font-medium text-fg/90 transition-colors hover:bg-subtle",
            dragging && overId === key && "bg-accent/20 ring-1 ring-accent",
          )}
          style={{ paddingLeft: 6 }}
        >
          <button
            className={cn("flex h-5 w-5 shrink-0 items-center justify-center rounded text-muted hover:bg-line/60", !kids.length && "invisible")}
            onClick={(e) => { e.stopPropagation(); toggle(`${key}:closed`); }}
          >
            <ChevronRight size={13} className={cn("transition-transform", isOpen && "rotate-90")} />
          </button>
          <Icon size={15} className="shrink-0 text-muted" />
          <span className="min-w-0 flex-1 truncate pl-0.5">{a.name}</span>
          <div className="hidden shrink-0 items-center group-hover/node:flex">
            <button className="btn-icon h-6 w-6" data-tip="폴더 만들기" onClick={(e) => { e.stopPropagation(); void add(null, a.id); }}><FolderPlus size={13} /></button>
          </div>
        </div>
        {isOpen && kids.map((k) => node(k, 1))}
      </Fragment>
    );
  };

  const node = (c: Category, depth: number): React.ReactNode => {
    const kids = children(c.id);
    const isOpen = open.has(c.id);
    const active = s.categoryId === c.id;
    const Icon = active || isOpen ? FolderOpen : Folder;
    return (
      <Fragment key={c.id}>
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
            "relative",
            dragging && overId === c.id && (zone === "into" || zone === null) && "bg-accent/20 ring-1 ring-accent",
          )}
          style={{
            paddingLeft: 6 + depth * 14,
            ...(c.color ? { "--fc-on": tint(folderColor(c.color), 0.2), "--fc-hover": tint(folderColor(c.color), 0.11) } as React.CSSProperties : {}),
          }}
        >
          {dragging && overId === c.id && (zone === "before" || zone === "after") && (
            <span className={cn("pointer-events-none absolute inset-x-1 h-0.5 rounded bg-accent", zone === "before" ? "-top-px" : "-bottom-px")} />
          )}
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
        {isOpen && kids.map((k) => node(k, depth + 1))}
      </Fragment>
    );
  };

  return (
    <div className="flex h-full w-56 shrink-0 flex-col border-r border-line bg-bg">
      <div className="flex h-10 shrink-0 items-center px-3">
        <span className="label flex-1">폴더</span>
        {arcId && <button className="btn-icon h-7 w-7" data-tip="새 폴더" onClick={() => void add(null)}><FolderPlus size={15} /></button>}
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
        {!arcId && s.archives.map((a) => archiveNode(a))}
        {children(null).map((c) => node(c, 0))}
        {menu && (() => {
          const c = cats.find((x) => x.id === menu.id);
          return c ? <FolderMenu c={c} at={menu} onClose={() => setMenu(null)} onRename={() => setEditing(c.id)} onAdd={() => void add(c.id)} /> : null;
        })()}
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
        <button key={t ?? "default"} onClick={() => pick(t)} data-tip={t ? FOLDER_NAMES[t] : "기본"} aria-label={t ? FOLDER_NAMES[t] : "기본"}
          className={cn("flex h-7 w-7 items-center justify-center rounded-full ring-offset-2 ring-offset-elevated transition-transform hover:scale-110", (c.color ?? null) === t && "ring-2 ring-fg/60")}
          style={{ background: folderColor(t) }} />
      ))}
      {/* own colours: picking one keeps this menu open so it can be adjusted */}
      <CustomSwatches value={c.color ?? null} onPick={(hex) => pick(hex, false)} />
    </div>
  );
}

/** Right-click menu of a folder: new sub-folder, rename, colour, delete (asks once more in place). */
function FolderMenu({ c, at, onClose, onRename, onAdd }: {
  c: Category; at: { x: number; y: number }; onClose: () => void; onRename: () => void; onAdd: () => void;
}) {
  const s = useApp();
  const ref = useRef<HTMLDivElement>(null);
  const pos = useOnScreen(ref, at.x, at.y) ?? { left: at.x, top: at.y };
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
      <CloudRow onSet={(on) => { void s.setItemsCloud({ categoryId: c.id }, on, `"${c.name}" 폴더`); onClose(); }} />
      <div className="mx-1 my-1 h-px bg-line" />
      <button className={cn(row, "text-danger")} onClick={() => { void s.deleteCategory(c.id); onClose(); }}><Trash2 size={14} />폴더 삭제</button>
    </div>
  );
}
