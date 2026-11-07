import { Folder } from "lucide-react";
import { useDrag } from "@/store/drag";

export function DragGhost() {
  const { ids, label, x, y, overId } = useDrag();
  if (!ids.length) return null;
  return (
    <div className="pointer-events-none fixed z-[90] flex items-center gap-1.5 rounded-lg bg-fg px-2.5 py-1.5 text-[length:calc(12px*var(--ts))] font-medium text-bg shadow-pop"
      style={{ left: x + 12, top: y + 12 }}>
      <Folder size={13} className={overId ? "text-accent" : "opacity-60"} />
      <span className="max-w-[220px] truncate">{label}</span>
    </div>
  );
}
