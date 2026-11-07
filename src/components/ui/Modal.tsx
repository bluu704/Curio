import { X } from "lucide-react";
import { useEffect, type ReactNode } from "react";
import { createPortal } from "react-dom";

export function Modal({ open, onClose, title, children, width = 560 }: {
  open: boolean; onClose: () => void; title: ReactNode; children: ReactNode; width?: number;
}) {
  useEffect(() => {
    if (!open) return;
    const k = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", k);
    return () => document.removeEventListener("keydown", k);
  }, [open, onClose]);
  if (!open) return null;
  return createPortal(
    <div className="anim-fade fixed inset-0 z-40 flex items-start justify-center bg-black/40 p-2 pt-4 sm:p-6 sm:pt-[10vh]" onMouseDown={onClose}>
      <div
        className="anim-pop flex max-h-[92vh] sm:max-h-[80vh] w-full flex-col overflow-hidden rounded-2xl border border-line bg-elevated shadow-pop"
        style={{ maxWidth: width }}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex h-12 shrink-0 items-center justify-between border-b border-line pl-5 pr-2">
          <div className="text-[length:calc(14px*var(--ts))] font-semibold">{title}</div>
          <button className="btn-icon" onClick={onClose} aria-label="닫기"><X size={16} /></button>
        </div>
        <div className="overflow-y-auto p-5">{children}</div>
      </div>
    </div>,
    document.body,
  );
}
