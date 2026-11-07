import { Plus, Trash2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useTheme } from "@/store/theme";
import { cn } from "@/lib/cn";
import { Popover } from "./Popover";
import { ColorPicker } from "./ColorPicker";

const WHEEL = "conic-gradient(#f43f5e, #f97316, #eab308, #22c55e, #06b6d4, #3b82f6, #8b5cf6, #ec4899, #f43f5e)";

/**
 * "My colours" after the preset swatches, then the colour wheel.
 * - wheel: pick a new colour → ✓ adds it as a swatch
 * - swatch left-click: use it and open the picker to adjust that swatch
 * - swatch right-click: a small delete button appears on it
 * `live` = apply while dragging (accent); otherwise only on ✓ / click (folders save to the library).
 */
export function CustomSwatches({ value, onPick, live, size = 28, exclude = [] }: {
  value: string | null; onPick: (hex: string) => void; live?: boolean; size?: number; exclude?: string[];
}) {
  const { custom, setCustom } = useTheme();
  const [del, setDel] = useState<number | null>(null);
  const [draft, setDraft] = useState(value ?? "#6366f1");
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (del === null) return;
    const off = (e: MouseEvent) => { if (!(e.target as HTMLElement).closest("[data-del-swatch]")) setDel(null); };
    document.addEventListener("mousedown", off, true);
    return () => document.removeEventListener("mousedown", off, true);
  }, [del]);

  const cur = value?.toLowerCase();
  const dim = { width: size, height: size };
  const ring = "shrink-0 rounded-full ring-offset-2 ring-offset-elevated transition-transform hover:scale-110";
  const add = (hex: string) => {
    const h = hex.toLowerCase();
    if (!custom.includes(h) && !exclude.includes(h)) setCustom([...custom, h]);
    onPick(h);
  };

  return (
    <div ref={box} className="contents">
      {custom.map((hex, i) => (
        <div key={i} className="relative shrink-0" style={dim}>
          <Popover trigger={({ toggle, open }) => (
            <button
              onClick={() => { setDel(null); onPick(hex); toggle(); }}
              onContextMenu={(e) => { e.preventDefault(); setDel(i); }}
              data-tip="왼쪽 클릭: 수정 · 오른쪽 클릭: 삭제"
              className={cn(ring, (open || cur === hex) && "ring-2 ring-fg/60")}
              style={{ ...dim, background: hex }}
            />
          )}>
            {(close) => (
              <ColorPicker
                value={hex}
                onChange={(h) => {
                  const next = [...useTheme.getState().custom];
                  next[i] = h;
                  setCustom(next);
                  if (live) onPick(h);
                }}
                onDone={() => { onPick(useTheme.getState().custom[i] ?? hex); close(); }}
              />
            )}
          </Popover>
          {del === i && (
            <button data-del-swatch onClick={() => { setCustom(custom.filter((_, j) => j !== i)); setDel(null); }} data-tip="이 색 지우기"
              className="anim-pop absolute -right-1.5 -top-1.5 z-10 flex h-[18px] w-[18px] items-center justify-center rounded-full bg-danger text-white shadow-pop ring-2 ring-elevated hover:scale-110">
              <Trash2 size={10} strokeWidth={2.5} />
            </button>
          )}
        </div>
      ))}
      <Popover trigger={({ toggle, open }) => (
        <button onClick={() => { setDraft(value ?? "#6366f1"); toggle(); }} data-tip="새 색 만들기"
          className={cn(ring, "flex items-center justify-center text-white", open && "ring-2 ring-fg/60")} style={{ ...dim, background: WHEEL }}>
          <Plus size={Math.round(size * 0.45)} strokeWidth={3} className="drop-shadow" />
        </button>
      )}>
        {(close) => <NewColor start={draft} live={live} onPick={onPick} onAdd={add} close={close} />}
      </Popover>
    </div>
  );
}

/** Picker for a new colour. Closing it (✓, Enter or a click outside) keeps the colour as a swatch. */
function NewColor({ start, live, onPick, onAdd, close }: {
  start: string; live?: boolean; onPick: (h: string) => void; onAdd: (h: string) => void; close: () => void;
}) {
  const [hex, setHex] = useState(start);
  const ref = useRef({ hex: start, done: false });
  useEffect(() => () => { if (!ref.current.done && ref.current.hex.toLowerCase() !== start.toLowerCase()) onAdd(ref.current.hex); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <ColorPicker
      value={hex}
      onChange={(h) => { setHex(h); ref.current.hex = h; if (live) onPick(h); }}
      onDone={() => { ref.current.done = true; onAdd(ref.current.hex); close(); }}
    />
  );
}
