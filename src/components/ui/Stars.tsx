import { Star } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/cn";

/** 0–5 rating with half steps. Click the same value again to clear. */
export function Stars({
  value, onChange, size = 14, readOnly,
}: { value: number | null; onChange?: (v: number | null) => void; size?: number; readOnly?: boolean }) {
  const [hover, setHover] = useState<number | null>(null);
  const shown = hover ?? value ?? 0;
  return (
    <div
      className={cn("inline-flex items-center", !readOnly && "cursor-pointer")}
      onMouseLeave={() => setHover(null)}
      role={readOnly ? undefined : "slider"}
      aria-valuenow={value ?? 0}
      aria-valuemin={0}
      aria-valuemax={5}
    >
      {[1, 2, 3, 4, 5].map((n) => {
        const fill = Math.max(0, Math.min(1, shown - (n - 1)));
        return (
          <span
            key={n}
            className="relative"
            style={{ width: size, height: size }}
            onMouseMove={(e) => {
              if (readOnly) return;
              const r = e.currentTarget.getBoundingClientRect();
              setHover(n - (e.clientX - r.left < r.width / 2 ? 0.5 : 0));
            }}
            onClick={(e) => {
              if (readOnly || !onChange) return;
              e.stopPropagation();
              const v = hover ?? n;
              onChange(v === value ? null : v);
            }}
          >
            <Star size={size} className="absolute inset-0 text-muted/30" fill="currentColor" strokeWidth={0} />
            {fill > 0 && (
              <span className="absolute inset-0 overflow-hidden" style={{ width: `${fill * 100}%` }}>
                <Star size={size} className="text-amber-400" fill="currentColor" strokeWidth={0} />
              </span>
            )}
          </span>
        );
      })}
    </div>
  );
}
