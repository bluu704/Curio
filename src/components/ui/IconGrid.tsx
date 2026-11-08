import { ImagePlus } from "lucide-react";
import { useRef } from "react";
import { ICON_CHOICES, iconOf, imageToIcon } from "@/lib/icons";
import { cn } from "@/lib/cn";

/**
 * Icon picker: every built-in icon plus "upload an image" (stored as a small data URL).
 * `suggested` (from the name being typed) come first, tinted with the accent colour.
 */
export function IconGrid({ value, onChange, cols = 8, choices = ICON_CHOICES, suggested = [], compact }: {
  value: string; onChange: (k: string) => void; cols?: number; choices?: string[]; suggested?: string[]; compact?: boolean;
}) {
  const list = [...suggested.filter((k) => choices.includes(k)), ...choices.filter((k) => !suggested.includes(k))];
  const input = useRef<HTMLInputElement>(null);
  const custom = value.startsWith("img:");
  const Current = iconOf(value);
  return (
    <div className={cn("overflow-y-auto overflow-x-hidden", compact ? "max-h-36" : "max-h-56")}>
      {/* fills the available width (never wider), so no sideways scrolling */}
      <div className="grid justify-between gap-0.5" style={{ gridTemplateColumns: `repeat(auto-fill, minmax(1.75rem, 1fr))`, maxWidth: `${cols * 2}rem` }}>
        <button type="button" onClick={() => input.current?.click()} data-tip="이미지 올리기"
          className={cn("flex h-7 w-full items-center justify-center rounded-md border border-dashed border-line text-muted hover:bg-subtle hover:text-fg", custom && "border-accent bg-accent/15")}>
          {custom ? <Current size={18} /> : <ImagePlus size={14} />}
        </button>
        {list.map((k) => {
          const I = iconOf(k);
          const hint = suggested.includes(k);
          return (
            <button key={k} type="button" onClick={() => onChange(k)}
              className={cn("flex h-7 w-full items-center justify-center rounded-md text-muted hover:bg-subtle hover:text-fg",
                hint && "text-accent ring-1 ring-inset ring-accent/40", value === k && "bg-accent/15 text-accent ring-0")}>
              <I size={15} />
            </button>
          );
        })}
      </div>
      <input ref={input} type="file" accept="image/*" hidden onChange={async (e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) onChange(await imageToIcon(f)); }} />
    </div>
  );
}
