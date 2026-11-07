import { Image as ImageIcon, Pin, Star } from "lucide-react";
import { useContext, useEffect, useMemo, useState } from "react";
import { api } from "@/api";
import type { CardConfig, Item } from "@/api/types";
import { useApp } from "@/store/app";
import { consumeDragClick } from "@/store/drag";
import { cn } from "@/lib/cn";
import { Stars } from "@/components/ui/Stars";
import { dragItem } from "./dragDrop";
import { ScrollCtx, useWidth } from "./virtual";

const COL_W = { s: 170, m: 230, l: 320 } as const;
const GAP = 12;
const TITLE_H = 26;

// ---- image aspect ratios (h / w), remembered so the layout does not jump on the next visit
const LS_ASPECT = "curio.aspect";
const aspects: Map<string, number> = (() => {
  try { return new Map(Object.entries(JSON.parse(localStorage.getItem(LS_ASPECT) ?? "{}") as Record<string, number>)); } catch { return new Map(); }
})();
let saveTimer: ReturnType<typeof setTimeout> | undefined;
/** h / w of the tile image; very tall strips / wide banners are cropped like Pinterest does. */
const ratioOf = (it: Item) => Math.min(2.6, Math.max(0.4, (it.coverUri && aspects.get(aspectKey(it))) || 4 / 3));
const aspectKey = (it: Item) => `${it.id}|${it.coverUri?.length ?? 0}|${it.coverUri?.slice(-24) ?? ""}`;
function rememberAspect(key: string, r: number) {
  aspects.set(key, r);
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try { localStorage.setItem(LS_ASPECT, JSON.stringify(Object.fromEntries([...aspects].slice(-5000)))); } catch { /* full / blocked */ }
  }, 800);
}

/**
 * Pinterest-style gallery: each image keeps its own shape and goes into the currently shortest
 * column, so columns stay level and the order reads left → right. Only tiles near the screen render.
 */
export function MasonryView({ items, card }: { items: Item[]; card: CardConfig }) {
  const scrollEl = useContext(ScrollCtx);
  const [wrap, setWrap] = useState<HTMLDivElement | null>(null);
  const width = useWidth(wrap);
  const [ver, bump] = useState(0);
  const [win, setWin] = useState({ top: 0, h: 1000 });

  useEffect(() => {
    if (!scrollEl) return;
    let raf = 0;
    const on = () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(() => setWin({ top: scrollEl.scrollTop - (wrap?.offsetTop ?? 0), h: scrollEl.clientHeight })); };
    on();
    scrollEl.addEventListener("scroll", on, { passive: true });
    const ro = new ResizeObserver(on);
    ro.observe(scrollEl);
    return () => { scrollEl.removeEventListener("scroll", on); ro.disconnect(); cancelAnimationFrame(raf); };
  }, [scrollEl, wrap]);

  const pad = width < 520 ? 10 : 16;
  const inner = Math.max(0, width - pad * 2);
  const target = width < 520 ? Math.min(COL_W[card.size], 160) : COL_W[card.size];
  const cols = Math.max(width < 520 ? 2 : 1, Math.round((inner + GAP) / (target + GAP)));
  const colW = (inner - GAP * (cols - 1)) / cols;

  const layout = useMemo(() => {
    const heights = new Array(cols).fill(0) as number[];
    const pos = items.map((it) => {
      const r = ratioOf(it);
      const h = colW * r + (card.showTitle ? TITLE_H : 0);
      let c = 0;
      for (let i = 1; i < cols; i++) if (heights[i] < heights[c] - 1) c = i;
      const p = { x: pad + c * (colW + GAP), y: pad + heights[c], h };
      heights[c] += h + GAP;
      return p;
    });
    return { pos, total: Math.max(0, ...heights) + pad * 2 };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, cols, colW, pad, card.showTitle, ver]);

  const onAspect = (it: Item, r: number) => {
    const k = aspectKey(it);
    const old = aspects.get(k);
    if (old && Math.abs(old - r) < 0.01) return;
    rememberAspect(k, r);
    bump((n) => n + 1);
  };

  const lo = win.top - 900, hi = win.top + win.h + 900;
  return (
    <div ref={setWrap} className="relative" style={{ height: layout.total }}>
      {width > 0 && items.map((it, i) => {
        const p = layout.pos[i];
        if (p.y > hi || p.y + p.h < lo) return null;
        return (
          <div key={it.id} className="absolute left-0 top-0 transition-transform duration-200" style={{ width: colW, transform: `translate(${p.x}px, ${p.y}px)` }}>
            <Tile item={it} card={card} ratio={ratioOf(it)} onAspect={(r) => onAspect(it, r)} />
          </div>
        );
      })}
    </div>
  );
}

function Tile({ item, card, ratio, onAspect }: { item: Item; card: CardConfig; ratio: number; onAspect: (r: number) => void }) {
  const { select, selectedId, updateItem } = useApp();
  const [broken, setBroken] = useState(false);
  const src = api.mediaUrl(item.coverUri);
  const author = item.tags.find((t) => t.category === "author")?.name;
  return (
    <div
      data-item-id={item.id}
      className="no-callout group relative cursor-pointer"
      onContextMenu={(e) => { e.preventDefault(); useApp.getState().openMenu({ x: e.clientX, y: e.clientY, target: { type: "item", id: item.id } }); }}
      onPointerDown={(e) => dragItem(e, item)}
      onClick={() => !consumeDragClick() && void select(item.id)}
    >
      <div className={cn("relative overflow-hidden rounded-xl bg-subtle ring-1 transition-shadow", selectedId === item.id ? "ring-2 ring-accent" : "ring-line/50 group-hover:shadow-pop")}>
        <div style={{ aspectRatio: `1 / ${ratio}` }}>
          {src && !broken ? (
            <img src={src} alt="" loading="lazy" decoding="async" draggable={false} onError={() => { setBroken(true); onAspect(4 / 3); }}
              onLoad={(e) => { const im = e.currentTarget; if (im.naturalWidth) onAspect(im.naturalHeight / im.naturalWidth); }} className="block h-full w-full object-cover" />
          ) : (
            <div className="flex h-full items-center justify-center text-muted/50"><ImageIcon size={30} strokeWidth={1.5} /></div>
          )}
        </div>
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/60 via-black/0 to-black/0 opacity-0 transition-opacity group-hover:opacity-100" />
        <div className="pointer-events-none absolute inset-x-0 bottom-0 p-2.5 text-white opacity-0 transition-opacity group-hover:opacity-100">
          <div className="truncate text-[length:calc(13px*var(--ts))] font-medium">{item.title}</div>
          <div className="flex items-center justify-between text-[length:calc(11px*var(--ts))] text-white/80">
            <span className="truncate">{author}</span>
            {card.fields.includes("rating") && item.rating != null && <Stars value={item.rating} readOnly size={10} />}
          </div>
        </div>
        {item.pinned && <span className="absolute left-1.5 top-1.5 flex h-6 w-6 items-center justify-center rounded-md bg-accent text-accent-fg"><Pin size={12} /></span>}
        <button
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => { e.stopPropagation(); void updateItem(item.id, { favorite: !item.favorite }); }}
          className={cn("absolute right-1.5 top-1.5 flex h-7 w-7 items-center justify-center rounded-lg bg-black/35 text-white backdrop-blur transition-opacity",
            item.favorite ? "opacity-100" : "opacity-0 group-hover:opacity-100")}
        >
          <Star size={14} fill={item.favorite ? "#fbbf24" : "none"} className={item.favorite ? "text-amber-400" : ""} />
        </button>
      </div>
      {card.showTitle && <div className="truncate px-0.5 pt-1.5 text-[length:calc(12px*var(--ts))] text-muted group-hover:text-fg">{item.title}</div>}
    </div>
  );
}
