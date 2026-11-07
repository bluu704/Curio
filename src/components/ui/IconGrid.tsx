import { ICON_CHOICES, ICONS } from "@/lib/icons";
import { cn } from "@/lib/cn";

export function IconGrid({ value, onChange, cols = 8 }: { value: string; onChange: (k: string) => void; cols?: number }) {
  return (
    <div className="grid gap-0.5" style={{ gridTemplateColumns: `repeat(${cols}, 1.75rem)` }}>
      {ICON_CHOICES.map((k) => {
        const I = ICONS[k];
        return (
          <button key={k} type="button" onClick={() => onChange(k)}
            className={cn("flex h-7 w-7 items-center justify-center rounded-md text-muted hover:bg-subtle hover:text-fg", value === k && "bg-accent/15 text-accent")}>
            <I size={15} />
          </button>
        );
      })}
    </div>
  );
}
