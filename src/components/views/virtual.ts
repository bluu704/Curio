import { createContext, useContext, useEffect, useState } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";

/** The main scroll container (provided by App) — virtual lists measure against it. */
export const ScrollCtx = createContext<HTMLElement | null>(null);

export function useWidth(el: HTMLElement | null) {
  const [w, setW] = useState(0);
  useEffect(() => {
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setW(e.contentRect.width));
    ro.observe(el);
    setW(el.getBoundingClientRect().width);
    return () => ro.disconnect();
  }, [el]);
  return w;
}

/** Row virtualizer bound to the app scroll container. Renders only visible rows (+overscan). */
export function useRows(count: number, estimate: number, anchor: HTMLElement | null) {
  const scrollEl = useContext(ScrollCtx);
  return useVirtualizer({
    count,
    getScrollElement: () => scrollEl,
    estimateSize: () => estimate,
    overscan: 6,
    scrollMargin: anchor?.offsetTop ?? 0,
  });
}
