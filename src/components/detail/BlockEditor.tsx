import {
  ArrowDown, ArrowUp, Code2, GripVertical, Heading1, Heading2, Heading3, Lightbulb, List, ListOrdered, Minus, Pilcrow, Plus,
  Sigma, SquareCheck, TextQuote, Trash2, type LucideIcon,
} from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { Block, BlockType } from "@/api/types";
import { uid } from "@/lib/format";
import { cn } from "@/lib/cn";
import { PREFIXES, parseMarkdown, renderInline, tex } from "@/lib/markdown";
import { Popover } from "@/components/ui/Popover";
import { MenuItem, MenuLabel, MenuSep } from "@/components/ui/Menu";

const TYPES: { type: BlockType; label: string; icon: LucideIcon }[] = [
  { type: "paragraph", label: "텍스트", icon: Pilcrow },
  { type: "h1", label: "제목 1  (#)", icon: Heading1 },
  { type: "heading", label: "제목 2  (##)", icon: Heading2 },
  { type: "h3", label: "제목 3  (###)", icon: Heading3 },
  { type: "bullet", label: "글머리 목록  (-)", icon: List },
  { type: "numbered", label: "번호 목록  (1.)", icon: ListOrdered },
  { type: "todo", label: "할 일  ([])", icon: SquareCheck },
  { type: "quote", label: "인용  (>)", icon: TextQuote },
  { type: "callout", label: "콜아웃  (!)", icon: Lightbulb },
  { type: "code", label: "코드  (```)", icon: Code2 },
  { type: "math", label: "수식 LaTeX  ($$)", icon: Sigma },
  { type: "divider", label: "구분선  (---)", icon: Minus },
];
/** Types that continue on Enter (like lists in any editor). */
const CONTINUES: BlockType[] = ["bullet", "numbered", "todo"];

/**
 * Notion-style block editor with markdown.
 * Each block shows rendered markdown; click it to edit the raw text. Typing "# ", "- ", "1. ", "> ", "```"…
 * at the start converts the block, and pasting multi-line markdown splits it into blocks.
 * Owns its state; the parent mounts it with `key={item.id}` and receives debounced `onChange`.
 */
export function BlockEditor({ initial, onChange }: { initial: Block[]; onChange: (b: Block[]) => void }) {
  const [blocks, setBlocks] = useState<Block[]>(initial);
  const [editing, setEditing] = useState<string | null>(null);
  const cb = useRef(onChange);
  cb.current = onChange;

  // Save only real edits (reference check survives StrictMode double-effects); flush on unmount.
  const pending = useRef<Block[] | null>(null);
  useEffect(() => {
    if (blocks === initial) return;
    pending.current = blocks;
    const t = setTimeout(() => { pending.current = null; cb.current(blocks); }, 500);
    return () => clearTimeout(t);
  }, [blocks, initial]);
  useEffect(() => () => { if (pending.current) cb.current(pending.current); }, []);

  // ---- drag the grip to reorder (pointer based: works with mouse, pen and touch)
  const [drag, setDrag] = useState<{ id: string; over: string | null; after: boolean } | null>(null);
  const dragRef = useRef<typeof drag>(null);
  const suppressClick = useRef(false);
  const startDrag = (e: React.PointerEvent, id: string) => {
    if (e.button !== 0) return;
    const sy = e.clientY;
    let active = false;
    const move = (ev: PointerEvent) => {
      if (!active && Math.abs(ev.clientY - sy) < 5) return;
      if (!active) { active = true; document.body.style.cursor = "grabbing"; }
      ev.preventDefault();
      const row = document.elementFromPoint(ev.clientX, ev.clientY)?.closest("[data-block-id]") as HTMLElement | null;
      const r = row?.getBoundingClientRect();
      dragRef.current = { id, over: row?.dataset.blockId ?? null, after: r ? ev.clientY > r.top + r.height / 2 : false };
      setDrag(dragRef.current);
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      document.body.style.cursor = "";
      if (!active) return;
      suppressClick.current = true;
      setTimeout(() => (suppressClick.current = false), 60);
      const d = dragRef.current;
      dragRef.current = null;
      setDrag(null);
      if (d?.over && d.over !== d.id) {
        setBlocks((bs) => {
          const moving = bs.find((b) => b.id === d.id)!;
          const rest = bs.filter((b) => b.id !== d.id);
          const at = rest.findIndex((b) => b.id === d.over) + (d.after ? 1 : 0);
          rest.splice(at, 0, moving);
          return rest;
        });
      }
    };
    window.addEventListener("pointermove", move, { passive: false });
    window.addEventListener("pointerup", up);
  };

  const patch = (id: string, p: Partial<Block>) => setBlocks((bs) => bs.map((b) => (b.id === id ? { ...b, ...p } : b)));
  const insertAfter = (id: string | null, type: BlockType = "paragraph", more: Block[] = []) => {
    const nb: Block = { id: uid(), type, text: "", ...(type === "todo" ? { checked: false } : {}) };
    const add = more.length ? more : [nb];
    setBlocks((bs) => {
      const i = id ? bs.findIndex((b) => b.id === id) : bs.length - 1;
      const next = [...bs];
      next.splice(i + 1, 0, ...add);
      return next;
    });
    const focus = add[add.length - 1];
    if (focus.type !== "divider") setEditing(focus.id);
  };
  const remove = (id: string) =>
    setBlocks((bs) => {
      const i = bs.findIndex((b) => b.id === id);
      if (bs[i - 1]) setEditing(bs[i - 1].id);
      return bs.filter((b) => b.id !== id);
    });
  const move = (id: string, d: -1 | 1) =>
    setBlocks((bs) => {
      const i = bs.findIndex((b) => b.id === id);
      const j = i + d;
      if (j < 0 || j >= bs.length) return bs;
      const next = [...bs];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });

  // number of each numbered item within its run
  const numberOf = (i: number) => {
    let n = 1;
    while (i - n >= 0 && blocks[i - n].type === "numbered") n++;
    return n;
  };

  return (
    <div className="-ml-7 space-y-0.5">
      {blocks.map((b, i) => (
        <div key={b.id} data-block-id={b.id} className={cn("relative", drag?.id === b.id && "opacity-40")}>
        {drag && drag.over === b.id && drag.id !== b.id && (
          <div className={cn("pointer-events-none absolute left-7 right-0 z-10 h-0.5 rounded-full bg-accent", drag.after ? "-bottom-px" : "-top-px")} />
        )}
        <BlockRow
          onGripDown={(e) => startDrag(e, b.id)}
          gripClickAllowed={() => !suppressClick.current}
          block={b}
          number={b.type === "numbered" ? numberOf(i) : 0}
          editing={editing === b.id}
          onEdit={(v) => setEditing(v ? b.id : null)}
          onText={(text) => {
            const hit = b.type === "paragraph" ? PREFIXES.find(([re]) => re.test(text)) : undefined;
            if (hit) {
              const [re, type] = hit;
              patch(b.id, { type, text: type === "divider" ? "" : text.replace(re, ""), ...(type === "todo" ? { checked: /^\[[xX]\]/.test(text) } : {}) });
              if (type === "divider") insertAfter(b.id);
            } else patch(b.id, { text });
          }}
          onPasteMarkdown={(md) => {
            const parsed = parseMarkdown(md);
            if (!parsed.length) return;
            const [first, ...rest] = parsed;
            if (!b.text) patch(b.id, { type: first.type, text: first.text, checked: first.checked });
            else rest.unshift(first);
            if (rest.length) insertAfter(b.id, "paragraph", rest);
          }}
          onPatch={(p) => patch(b.id, p)}
          onEnter={() => insertAfter(b.id, CONTINUES.includes(b.type) && b.text ? b.type : "paragraph")}
          onBackspaceEmpty={() => (b.type === "paragraph" ? remove(b.id) : patch(b.id, { type: "paragraph" }))}
          onInsert={(t) => insertAfter(b.id, t)}
          onRemove={() => remove(b.id)}
          onMove={(d) => move(b.id, d)}
        />
        </div>
      ))}
      <button
        className="ml-7 flex h-8 w-[calc(100%-1.75rem)] items-center gap-1.5 rounded-md px-1 text-[length:calc(13px*var(--ts))] text-muted/70 hover:bg-subtle hover:text-muted"
        onClick={() => insertAfter(null)}
      >
        <Plus size={14} />
        {blocks.length ? "블록 추가" : "메모를 작성하세요…  (마크다운 · LaTeX $수식$ 지원)"}
      </button>
    </div>
  );
}

function BlockRow({
  onGripDown, gripClickAllowed, block, number, editing, onEdit, onText, onPasteMarkdown, onPatch, onEnter, onBackspaceEmpty, onInsert, onRemove, onMove,
}: {
  onGripDown: (e: React.PointerEvent) => void; gripClickAllowed: () => boolean;
  block: Block; number: number; editing: boolean; onEdit: (v: boolean) => void;
  onText: (t: string) => void; onPasteMarkdown: (md: string) => void; onPatch: (p: Partial<Block>) => void;
  onEnter: () => void; onBackspaceEmpty: () => void; onInsert: (t: BlockType) => void; onRemove: () => void; onMove: (d: -1 | 1) => void;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const showEditor = editing || !block.text;

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "0px";
    el.style.height = el.scrollHeight + "px";
  }, [block.text, block.type, showEditor]);

  useEffect(() => {
    if (editing && ref.current && document.activeElement !== ref.current) {
      ref.current.focus();
      const n = ref.current.value.length;
      ref.current.setSelectionRange(n, n);
    }
  }, [editing]);

  const iconRow = (items: typeof TYPES, onPick: (t: BlockType) => void, current?: BlockType) => (
    <div className="grid grid-cols-6 gap-0.5 px-1 pb-1">
      {items.map((t) => (
        <button key={t.type} data-tip={t.label} onClick={() => onPick(t.type)} className={cn("btn-icon h-7 w-7", current === t.type && "active text-accent")}>
          <t.icon size={15} />
        </button>
      ))}
    </div>
  );

  const gutter = (
    <div className="touch-show flex w-7 shrink-0 justify-center pt-1 opacity-0 transition-opacity group-hover/block:opacity-100 has-[[aria-expanded=true]]:opacity-100">
      <Popover width={216} trigger={({ open, toggle }) => (
        <button aria-expanded={open} className="flex h-6 w-5 cursor-grab touch-none items-center justify-center rounded text-muted hover:bg-subtle active:cursor-grabbing"
          onPointerDown={onGripDown} onClick={() => gripClickAllowed() && toggle()} data-tip="끌어서 이동 · 눌러서 메뉴">
          <GripVertical size={14} />
        </button>
      )}>
        {(close) => (
          <>
            <MenuLabel>아래에 추가</MenuLabel>
            {iconRow(TYPES, (t) => { onInsert(t); close(); })}
            {block.type !== "divider" && (
              <>
                <MenuLabel>전환</MenuLabel>
                {iconRow(TYPES.filter((t) => t.type !== "divider"), (t) => { onPatch({ type: t }); close(); }, block.type)}
              </>
            )}
            <MenuSep />
            <MenuItem icon={ArrowUp} onClick={() => { onMove(-1); close(); }}>위로 이동</MenuItem>
            <MenuItem icon={ArrowDown} onClick={() => { onMove(1); close(); }}>아래로 이동</MenuItem>
            <MenuItem icon={Trash2} danger onClick={() => { onRemove(); close(); }}>삭제</MenuItem>
          </>
        )}
      </Popover>
    </div>
  );

  if (block.type === "divider") {
    return (
      <div className="group/block flex items-center">
        {gutter}
        <div className="h-6 flex-1 py-3"><div className="h-px bg-line" /></div>
      </div>
    );
  }

  const isCode = block.type === "code" || block.type === "math";
  const isMath = block.type === "math";
  const textStyle = cn(
    "leading-relaxed",
    block.type === "h1" && "text-[length:calc(20px*var(--ts))] font-bold",
    block.type === "heading" && "text-[length:calc(16px*var(--ts))] font-semibold",
    block.type === "h3" && "text-[length:calc(14px*var(--ts))] font-semibold",
    block.type === "todo" && block.checked && "text-muted line-through",
    isCode && "font-mono text-[length:calc(12px*var(--ts))] leading-normal",
  );

  const body = showEditor ? (
    <textarea
      ref={ref}
      rows={1}
      value={block.text}
      placeholder={block.type.startsWith("h") ? "제목" : isMath ? "LaTeX 수식  예: E = mc^2" : isCode ? "코드" : "내용 입력"}
      onFocus={() => onEdit(true)}
      onBlur={() => onEdit(false)}
      onChange={(e) => onText(e.target.value)}
      onPaste={(e) => {
        const t = e.clipboardData.getData("text/plain");
        if (!isCode && t.includes("\n")) { e.preventDefault(); onPasteMarkdown(t); }
      }}
      onKeyDown={(e) => {
        if (e.nativeEvent.isComposing) return;
        if (e.key === "Enter" && !e.shiftKey && (!isCode || e.ctrlKey || e.metaKey)) { e.preventDefault(); onEnter(); }
        if (e.key === "Backspace" && block.text === "") { e.preventDefault(); onBackspaceEmpty(); }
        if (e.key === "Escape") e.currentTarget.blur();
      }}
      spellCheck={!isCode}
      className={cn("block w-full resize-none overflow-hidden bg-transparent py-1 outline-none placeholder:text-muted/40", textStyle)}
    />
  ) : (
    isMath ? (
      <div className="cursor-text overflow-x-auto py-1" onClick={() => onEdit(true)} dangerouslySetInnerHTML={{ __html: tex(block.text, true) }} />
    ) : (
      <div className={cn("cursor-text whitespace-pre-wrap break-words py-1", textStyle)} onClick={() => onEdit(true)}>
        {isCode ? block.text : renderInline(block.text)}
      </div>
    )
  );

  return (
    <div className="group/block flex items-start">
      {gutter}
      <div className="min-w-0 flex-1">
        {block.type === "quote" && <div className="border-l-[3px] border-fg/25 pl-3 italic text-fg/80">{body}</div>}
        {block.type === "callout" && (
          <div className="flex gap-2 rounded-lg bg-subtle px-3 py-1.5"><Lightbulb size={16} className="mt-1.5 shrink-0 text-amber-500" /><div className="min-w-0 flex-1">{body}</div></div>
        )}
        {isCode && <div className={cn("rounded-lg px-3 py-1.5", isMath && !showEditor ? "bg-transparent" : "bg-subtle")}>{body}</div>}
        {block.type === "todo" && (
          <div className="flex items-start gap-2">
            <input type="checkbox" checked={!!block.checked} onChange={(e) => onPatch({ checked: e.target.checked })}
              className="mt-[7px] h-4 w-4 shrink-0 cursor-pointer accent-[rgb(var(--accent))]" />
            <div className="min-w-0 flex-1">{body}</div>
          </div>
        )}
        {(block.type === "bullet" || block.type === "numbered") && (
          <div className="flex items-start gap-2">
            <span className="mt-1 w-4 shrink-0 text-right leading-relaxed text-muted">{block.type === "bullet" ? "•" : `${number}.`}</span>
            <div className="min-w-0 flex-1">{body}</div>
          </div>
        )}
        {["paragraph", "h1", "heading", "h3"].includes(block.type) && body}
      </div>
    </div>
  );
}
