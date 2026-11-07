import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/cn";

export function Segmented<T extends string>({
  value, onChange, options,
}: { value: T; onChange: (v: T) => void; options: { value: T; icon?: LucideIcon; label?: string; tip?: string }[] }) {
  return (
    <div className="inline-flex rounded-lg bg-subtle p-0.5">
      {options.map((o) => {
        const Icon = o.icon;
        return (
          <button
            key={o.value}
            data-tip={o.tip}
            onClick={() => onChange(o.value)}
            className={cn(
              "inline-flex h-7 min-w-7 items-center justify-center gap-1 rounded-md px-1.5 text-[length:calc(12px*var(--ts))] font-medium transition-colors",
              value === o.value ? "bg-surface text-fg shadow-card" : "text-muted hover:text-fg",
            )}
          >
            {Icon && <Icon size={15} />}
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
