import { Check } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/cn";

// ---- colour maths (hex ⇄ HSV)
type HSV = { h: number; s: number; v: number };
const clamp = (x: number, a = 0, b = 1) => Math.min(b, Math.max(a, x));

export function hexToHsv(hex: string): HSV {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  const n = m ? parseInt(m[1], 16) : 0x6366f1;
  const r = (n >> 16) / 255, g = ((n >> 8) & 255) / 255, b = (n & 255) / 255;
  const max = Math.max(r, g, b), d = max - Math.min(r, g, b);
  let h = 0;
  if (d) h = max === r ? ((g - b) / d + 6) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return { h: h * 60, s: max ? d / max : 0, v: max };
}

export function hsvToHex({ h, s, v }: HSV): string {
  const f = (n: number) => {
    const k = (n + h / 60) % 6;
    return Math.round(255 * (v - v * s * Math.max(0, Math.min(k, 4 - k, 1))));
  };
  return "#" + [f(5), f(3), f(1)].map((x) => x.toString(16).padStart(2, "0")).join("");
}

/** Drag helper: calls `fn(x, y)` with 0..1 coordinates inside `el` while the pointer is down. */
function useDrag(fn: (x: number, y: number) => void) {
  const ref = useRef<HTMLDivElement>(null);
  const onPointerDown = (e: React.PointerEvent) => {
    const el = ref.current!;
    el.setPointerCapture(e.pointerId);
    const at = (ev: { clientX: number; clientY: number }) => {
      const r = el.getBoundingClientRect();
      fn(clamp((ev.clientX - r.left) / r.width), clamp((ev.clientY - r.top) / r.height));
    };
    at(e);
    const move = (ev: PointerEvent) => at(ev);
    const up = () => { el.removeEventListener("pointermove", move); el.removeEventListener("pointerup", up); };
    el.addEventListener("pointermove", move);
    el.addEventListener("pointerup", up);
  };
  return { ref, onPointerDown };
}

/**
 * Colour picker drawn with the app's own surfaces (replaces the OS colour dialog):
 * saturation/brightness square, hue strip, hex field and optional preset swatches.
 */
export function ColorPicker({ value, onChange, presets, onDone }: {
  value: string;
  onChange: (hex: string) => void;
  presets?: string[];
  onDone?: () => void;
}) {
  const [hsv, setHsv] = useState<HSV>(() => hexToHsv(value));
  const [text, setText] = useState(value);
  // follow outside changes (e.g. a preset picked elsewhere) without fighting the drag
  useEffect(() => { if (value.toLowerCase() !== hsvToHex(hsv)) { setHsv(hexToHsv(value)); setText(value); } }, [value]); // eslint-disable-line react-hooks/exhaustive-deps

  const set = (next: HSV) => { setHsv(next); const hex = hsvToHex(next); setText(hex); onChange(hex); };
  const sv = useDrag((x, y) => set({ ...hsv, s: x, v: 1 - y }));
  const hue = useDrag((x) => set({ ...hsv, h: x * 360 }));
  const hex = hsvToHex(hsv);
  const pure = hsvToHex({ h: hsv.h, s: 1, v: 1 });

  return (
    <div className="w-[232px] space-y-3 p-3">
      <div {...sv} className="relative h-36 cursor-crosshair touch-none overflow-hidden rounded-xl ring-1 ring-inset ring-black/5"
        style={{ background: `linear-gradient(to top, #000, transparent), linear-gradient(to right, #fff, ${pure})` }}>
        <span className="pointer-events-none absolute h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow-[0_0_0_1px_rgba(0,0,0,.25),0_1px_4px_rgba(0,0,0,.3)]"
          style={{ left: `${hsv.s * 100}%`, top: `${(1 - hsv.v) * 100}%`, background: hex }} />
      </div>
      <div {...hue} className="relative h-3 cursor-pointer touch-none rounded-full ring-1 ring-inset ring-black/5"
        style={{ background: "linear-gradient(to right,#f00,#ff0,#0f0,#0ff,#00f,#f0f,#f00)" }}>
        <span className="pointer-events-none absolute top-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow-[0_0_0_1px_rgba(0,0,0,.25),0_1px_4px_rgba(0,0,0,.3)]"
          style={{ left: `${(hsv.h / 360) * 100}%`, background: pure }} />
      </div>
      <div className="flex items-center gap-2">
        <span className="h-8 w-8 shrink-0 rounded-lg ring-1 ring-inset ring-black/10" style={{ background: hex }} />
        <input
          value={text}
          spellCheck={false}
          onChange={(e) => {
            const t = e.target.value.trim();
            setText(t);
            const m = /^#?([0-9a-f]{6})$/i.exec(t);
            if (m) { const h = `#${m[1].toLowerCase()}`; setHsv(hexToHsv(h)); onChange(h); }
          }}
          onKeyDown={(e) => e.key === "Enter" && onDone?.()}
          className="input h-8 min-w-0 flex-1 font-mono uppercase"
        />
        {onDone && <button className="btn-icon h-8 w-8 shrink-0 bg-accent text-accent-fg hover:bg-accent/90 hover:text-accent-fg" onClick={onDone} data-tip="완료"><Check size={15} /></button>}
      </div>
      {presets && presets.length > 0 && (
        <div className="flex flex-wrap gap-1.5 border-t border-line pt-3">
          {presets.map((p) => (
            <button key={p} onClick={() => { setHsv(hexToHsv(p)); setText(p); onChange(p); }}
              className={cn("h-6 w-6 rounded-full ring-offset-2 ring-offset-elevated transition-transform hover:scale-110", p.toLowerCase() === hex && "ring-2 ring-fg/60")}
              style={{ background: p }} />
          ))}
        </div>
      )}
    </div>
  );
}
