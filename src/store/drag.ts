import { create } from "zustand";
import type { ID } from "@/api/types";

/**
 * Pointer-based drag (cards → category folders).
 * HTML5 DnD is unreliable inside Tauri on Windows while native file-drop is enabled,
 * so we track the pointer ourselves and hit-test `[data-drop-category]` elements.
 */
interface DragState {
  ids: ID[];
  label: string;
  x: number;
  y: number;
  overId: string | null;
  /** Dragging a folder over another: its top / bottom edge = put before / after it, the middle = inside. */
  zone: "before" | "after" | "into" | null;
  set(p: Partial<DragState>): void;
}
export const useDrag = create<DragState>((set) => ({ ids: [], label: "", x: 0, y: 0, overId: null, zone: null, set: (p) => set(p) }));

let justDragged = false;
/** Call in onClick: returns true if this click is the end of a drag (and should be ignored). */
export const consumeDragClick = () => { const v = justDragged; justDragged = false; return v; };

/** Touch: hold ~0.5 s without moving → `fire(x, y)` (context menu). Returns nothing; cancels itself on move/up. */
export function longPress(e: React.PointerEvent, fire: (x: number, y: number) => void) {
  const sx = e.clientX, sy = e.clientY;
  const t = setTimeout(() => { cleanup(); justDragged = true; setTimeout(() => (justDragged = false), 400); navigator.vibrate?.(10); fire(sx, sy); }, 480);
  const move = (ev: PointerEvent) => { if (Math.hypot(ev.clientX - sx, ev.clientY - sy) > 8) cleanup(); };
  const cleanup = () => { clearTimeout(t); window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", cleanup); window.removeEventListener("pointercancel", cleanup); };
  window.addEventListener("pointermove", move);
  window.addEventListener("pointerup", cleanup);
  window.addEventListener("pointercancel", cleanup);
}

export function startItemDrag(e: React.PointerEvent, ids: ID[], label: string, onDrop: (ids: ID[], target: string, zone: DragState["zone"]) => void) {
  if (e.button !== 0 || e.pointerType === "touch") return; // touch scrolls; long-press opens the menu instead
  const sx = e.clientX, sy = e.clientY;
  let active = false;
  const folder = ids[0]?.startsWith("cat:");
  const hit = (x: number, y: number) =>
    (document.elementFromPoint(x, y)?.closest("[data-drop-category]") as HTMLElement | null)?.dataset.dropCategory ?? null;
  const zoneAt = (x: number, y: number): DragState["zone"] => {
    const el = document.elementFromPoint(x, y)?.closest("[data-drop-category]") as HTMLElement | null;
    const id = el?.dataset.dropCategory;
    if (!folder || !el || !id || id === "root" || id.startsWith("arc:")) return null;
    const r = el.getBoundingClientRect(), f = (y - r.top) / r.height;
    return f < 0.3 ? "before" : f > 0.7 ? "after" : "into";
  };
  const move = (ev: PointerEvent) => {
    if (!active && Math.hypot(ev.clientX - sx, ev.clientY - sy) < 6) return;
    if (!active) { active = true; document.body.style.cursor = "grabbing"; }
    useDrag.getState().set({ ids, label, x: ev.clientX, y: ev.clientY, overId: hit(ev.clientX, ev.clientY), zone: zoneAt(ev.clientX, ev.clientY) });
  };
  const up = (ev: PointerEvent) => {
    window.removeEventListener("pointermove", move);
    window.removeEventListener("pointerup", up);
    document.body.style.cursor = "";
    if (!active) return;
    justDragged = true;
    setTimeout(() => (justDragged = false), 50);
    const target = hit(ev.clientX, ev.clientY);
    const zone = zoneAt(ev.clientX, ev.clientY);
    useDrag.getState().set({ ids: [], overId: null, zone: null });
    if (target) onDrop(ids, target, zone);
  };
  window.addEventListener("pointermove", move);
  window.addEventListener("pointerup", up);
}
