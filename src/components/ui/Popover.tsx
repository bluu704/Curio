import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/cn";

interface Props {
  trigger: (p: { open: boolean; toggle: () => void }) => ReactNode;
  children: ReactNode | ((close: () => void) => ReactNode);
  align?: "start" | "end";
  className?: string;
  width?: number;
}

/** Portal popover positioned against its trigger (never clipped by scroll containers). */
export function Popover({ trigger, children, align = "start", className, width }: Props) {
  const [open, setOpen] = useState(false);
  const anchor = useRef<HTMLSpanElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const close = () => setOpen(false);

  useLayoutEffect(() => {
    if (!open || !anchor.current) return;
    const place = () => {
      const r = anchor.current!.getBoundingClientRect();
      const pw = panel.current?.offsetWidth ?? width ?? 220;
      const ph = panel.current?.offsetHeight ?? 0;
      let left = align === "end" ? r.right - pw : r.left;
      left = Math.max(8, Math.min(left, window.innerWidth - pw - 8));
      let top = r.bottom + 6;
      if (top + ph > window.innerHeight - 8) top = Math.max(8, r.top - ph - 6);
      setPos({ top, left });
    };
    place();
    const raf = requestAnimationFrame(place); // re-measure after content renders
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [open, align, width]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (!panel.current?.contains(t) && !anchor.current?.contains(t)) close();
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <>
      <span ref={anchor} className="inline-flex">{trigger({ open, toggle: () => setOpen((o) => !o) })}</span>
      {open &&
        createPortal(
          <div
            ref={panel}
            className={cn("popover anim-pop fixed z-50", className)}
            style={{ top: pos?.top ?? -9999, left: pos?.left ?? -9999, width }}
          >
            {typeof children === "function" ? children(close) : children}
          </div>,
          document.body,
        )}
    </>
  );
}
