import { useLayoutEffect, useState, type RefObject } from "react";

/**
 * Position for a floating panel opened at (x, y): moved so it stays inside the window, and re-measured
 * whenever the panel changes size (e.g. a section opens) or the window is resized. Taller than the
 * window → pinned to the top; the panel itself scrolls (see `.popover` in index.css).
 */
export function useOnScreen(ref: RefObject<HTMLElement | null>, x: number, y: number, active = true) {
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!active || !el) return;
    const place = () => {
      const w = el.offsetWidth, h = el.offsetHeight;
      setPos({ left: Math.max(8, Math.min(x, innerWidth - w - 8)), top: Math.max(8, Math.min(y, innerHeight - h - 8)) });
    };
    place();
    const ro = new ResizeObserver(place);
    ro.observe(el);
    addEventListener("resize", place);
    return () => { ro.disconnect(); removeEventListener("resize", place); };
  }, [ref, x, y, active]);
  return pos;
}
