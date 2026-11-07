import { Check } from "lucide-react";
import { usePick } from "@/store/pick";
import { cn } from "@/lib/cn";

/** Round checkbox in a card's corner: shows on hover, and stays while anything is picked. */
export function PickBox({ id, className, row }: { id: string; className?: string; row?: boolean }) {
  const on = usePick((p) => p.ids.has(id));
  const any = usePick((p) => p.ids.size > 0);
  return (
    <button
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => { e.stopPropagation(); if (e.shiftKey) usePick.getState().range(id); else usePick.getState().toggle(id); }}
      data-tip={on ? "선택 해제" : "선택"}
      className={cn(
        "touch-show flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 transition-all",
        className,
        // picked: always the accent colour (with a ring so it stands out on any cover)
        on ? "border-accent bg-accent text-accent-fg opacity-100 shadow-[0_0_0_2px_rgb(var(--accent)/0.35)]"
          : row ? "border-muted/60 bg-surface text-transparent hover:border-accent"
          : "border-white bg-black/30 text-transparent shadow-[0_0_0_1px_rgba(0,0,0,.25)] backdrop-blur hover:border-accent",
        !on && !any && "opacity-0 group-hover:opacity-100",
      )}
    >
      <Check size={13} strokeWidth={3} />
    </button>
  );
}

/** Ring / tint for picked cards. */
export const usePicked = (id: string) => usePick((p) => p.ids.has(id));
