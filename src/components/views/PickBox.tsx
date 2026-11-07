import { Check } from "lucide-react";
import { usePick } from "@/store/pick";
import { cn } from "@/lib/cn";

/** Round checkbox in a card's corner: shows on hover, and stays while anything is picked. */
export function PickBox({ id, className }: { id: string; className?: string }) {
  const on = usePick((p) => p.ids.has(id));
  const any = usePick((p) => p.ids.size > 0);
  return (
    <button
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => { e.stopPropagation(); if (e.shiftKey) usePick.getState().range(id); else usePick.getState().toggle(id); }}
      data-tip={on ? "선택 해제" : "선택"}
      className={cn(
        "touch-show flex h-6 w-6 items-center justify-center rounded-full border-2 transition-all",
        on ? "border-accent bg-accent text-accent-fg opacity-100" : "border-white/90 bg-black/25 text-transparent backdrop-blur hover:bg-black/40",
        !on && !any && "opacity-0 group-hover:opacity-100",
        className,
      )}
    >
      <Check size={13} strokeWidth={3} />
    </button>
  );
}

/** Ring / tint for picked cards. */
export const usePicked = (id: string) => usePick((p) => p.ids.has(id));
