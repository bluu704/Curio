import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

type Side = "bottom" | "top" | "right" | "left";
interface Tip { text: string; x: number; y: number; side: Side }

/**
 * One global tooltip for every element with `data-tip="..."` (optional `data-tip-side`).
 * Rendered in a portal so it is never clipped by overflow containers.
 */
export function TooltipLayer() {
  const [tip, setTip] = useState<Tip | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>();
  const current = useRef<Element | null>(null);

  useEffect(() => {
    const hide = () => { clearTimeout(timer.current); current.current = null; setTip(null); };
    const over = (e: MouseEvent) => {
      const el = (e.target as Element).closest?.("[data-tip]");
      if (el === current.current) return;
      hide();
      if (!el) return;
      const text = el.getAttribute("data-tip");
      if (!text) return;
      current.current = el;
      timer.current = setTimeout(() => {
        if (!el.isConnected) return;
        const r = el.getBoundingClientRect();
        const side = (el.getAttribute("data-tip-side") as Side) || "bottom";
        const pos = {
          bottom: { x: r.left + r.width / 2, y: r.bottom + 6 },
          top: { x: r.left + r.width / 2, y: r.top - 6 },
          right: { x: r.right + 8, y: r.top + r.height / 2 },
          left: { x: r.left - 8, y: r.top + r.height / 2 },
        }[side];
        setTip({ text, side, ...pos });
      }, 350);
    };
    document.addEventListener("mouseover", over);
    document.addEventListener("mousedown", hide, true);
    document.addEventListener("scroll", hide, true);
    window.addEventListener("blur", hide);
    return () => {
      document.removeEventListener("mouseover", over);
      document.removeEventListener("mousedown", hide, true);
      document.removeEventListener("scroll", hide, true);
      window.removeEventListener("blur", hide);
    };
  }, []);

  if (!tip) return null;
  const transform = {
    bottom: "translate(-50%, 0)",
    top: "translate(-50%, -100%)",
    right: "translate(0, -50%)",
    left: "translate(-100%, -50%)",
  }[tip.side];
  return createPortal(
    <div
      className="anim-fade pointer-events-none fixed z-[100] whitespace-nowrap rounded-md bg-fg px-2 py-1 text-[length:calc(11px*var(--ts))] font-medium text-bg shadow-pop"
      style={{ left: tip.x, top: tip.y, transform }}
    >
      {tip.text}
    </div>,
    document.body,
  );
}
