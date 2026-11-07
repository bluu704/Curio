import { Image as ImageIcon, Pin, Star } from "lucide-react";
import { useState } from "react";
import { api } from "@/api";
import type { CardConfig, Item } from "@/api/types";
import { useApp } from "@/store/app";
import { consumeDragClick } from "@/store/drag";
import { cn } from "@/lib/cn";
import { Stars } from "@/components/ui/Stars";
import { dragItem } from "./dragDrop";

const COL_W = { s: 170, m: 230, l: 320 } as const;

/** Pinterest-style gallery for illustrations: every image keeps its own aspect ratio. */
export function MasonryView({ items, card }: { items: Item[]; card: CardConfig }) {
  return (
    <div className="p-4" style={{ columnWidth: COL_W[card.size], columnGap: 12 }}>
      {items.map((it) => <Tile key={it.id} item={it} card={card} />)}
    </div>
  );
}

function Tile({ item, card }: { item: Item; card: CardConfig }) {
  const { select, selectedId, updateItem } = useApp();
  const [broken, setBroken] = useState(false);
  const src = api.mediaUrl(item.coverUri);
  const author = item.tags.find((t) => t.category === "author")?.name;
  return (
    <div
      data-item-id={item.id}
      className="no-callout group relative mb-3 cursor-pointer break-inside-avoid"
      onContextMenu={(e) => { e.preventDefault(); useApp.getState().openMenu({ x: e.clientX, y: e.clientY, target: { type: "item", id: item.id } }); }}
      onPointerDown={(e) => dragItem(e, item)}
      onClick={() => !consumeDragClick() && void select(item.id)}
    >
      <div className={cn("relative overflow-hidden rounded-xl bg-subtle ring-1 transition-shadow", selectedId === item.id ? "ring-2 ring-accent" : "ring-line/50 group-hover:shadow-pop")}>
        {src && !broken ? (
          <img src={src} alt="" loading="lazy" decoding="async" draggable={false} onError={() => setBroken(true)} className="block h-auto w-full" />
        ) : (
          <div className="flex aspect-[3/4] items-center justify-center text-muted/50"><ImageIcon size={30} strokeWidth={1.5} /></div>
        )}
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
