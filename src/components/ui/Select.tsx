import { Check, ChevronDown, type LucideIcon } from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/cn";

export interface SelectOption<T extends string> { value: T; label: string; icon?: LucideIcon }

/**
 * Drop-down in the app's own style (the browser's native list ignores the theme).
 * `className` styles the button the same way an <input> / <select> was styled.
 */
export function Select<T extends string>({ value, onChange, options, className, title, bare }: {
  value: T; onChange: (v: T) => void; options: SelectOption<T>[]; className?: string; title?: string;
  /** no input frame (inline editors) */
  bare?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [hi, setHi] = useState(0);
  const btn = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number; width: number } | null>(null);
  const cur = options.find((o) => o.value === value);

  useLayoutEffect(() => {
    if (!open) { setPos(null); return; }
    const place = () => {
      const r = btn.current!.getBoundingClientRect();
      const ph = panel.current?.offsetHeight ?? 0, pw = Math.max(r.width, panel.current?.offsetWidth ?? 0);
      let top = r.bottom + 4;
      if (top + ph > innerHeight - 8) { const up = r.top - ph - 4; top = up >= 8 ? up : Math.max(8, innerHeight - ph - 8); }
      setPos({ top, left: Math.max(8, Math.min(r.left, innerWidth - pw - 8)), width: r.width });
    };
    place();
    const ro = new ResizeObserver(place);
    if (panel.current) ro.observe(panel.current);
    addEventListener("resize", place);
    addEventListener("scroll", place, true);
    return () => { ro.disconnect(); removeEventListener("resize", place); removeEventListener("scroll", place, true); };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    setHi(Math.max(0, options.findIndex((o) => o.value === value)));
    const down = (e: MouseEvent) => { const t = e.target as Node; if (!panel.current?.contains(t) && !btn.current?.contains(t)) setOpen(false); };
    document.addEventListener("mousedown", down, true);
    return () => document.removeEventListener("mousedown", down, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => { if (open) panel.current?.querySelector<HTMLElement>(`[data-i="${hi}"]`)?.scrollIntoView({ block: "nearest" }); }, [open, hi]);

  const pick = (v: T) => { onChange(v); setOpen(false); btn.current?.focus(); };
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      if (!open) { setOpen(true); return; }
      setHi((i) => (i + (e.key === "ArrowDown" ? 1 : -1) + options.length) % options.length);
    } else if ((e.key === "Enter" || e.key === " ") && open) {
      e.preventDefault();
      if (options[hi]) pick(options[hi].value);
    } else if (e.key === "Escape" && open) {
      e.preventDefault(); e.stopPropagation(); setOpen(false);
    }
  };

  const Icon = cur?.icon;
  return (
    <>
      <button ref={btn} type="button" title={title} onClick={() => setOpen((o) => !o)} onKeyDown={onKey}
        className={cn(!bare && "input", "flex items-center gap-1.5 text-left", open && !bare && "border-accent/60", className)}>
        {Icon && <Icon size={14} className="shrink-0 text-muted" />}
        <span className="min-w-0 flex-1 truncate">{cur?.label ?? ""}</span>
        <ChevronDown size={14} className={cn("shrink-0 text-muted transition-transform", open && "rotate-180")} />
      </button>
      {open && createPortal(
        <div ref={panel} role="listbox" onKeyDown={onKey}
          className="popover anim-pop fixed z-[95] max-h-72"
          style={{ top: pos?.top ?? -9999, left: pos?.left ?? -9999, minWidth: pos?.width }}>
          {options.map((o, i) => {
            const I = o.icon;
            const on = o.value === value;
            return (
              <button key={o.value} type="button" role="option" aria-selected={on} data-i={i}
                onMouseEnter={() => setHi(i)} onClick={() => pick(o.value)}
                className={cn("flex h-8 w-full items-center gap-2 whitespace-nowrap rounded-lg px-2 text-left text-[length:calc(13px*var(--ts))]",
                  i === hi && "bg-subtle", on ? "font-medium text-accent" : "text-fg")}>
                {I && <I size={14} className={on ? "text-accent" : "text-muted"} />}
                <span className="flex-1 truncate">{o.label}</span>
                {on && <Check size={14} className="shrink-0" />}
              </button>
            );
          })}
        </div>,
        document.body,
      )}
    </>
  );
}
