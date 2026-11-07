import { Files, Pin, Star } from "lucide-react";
import { useState } from "react";
import type { CardConfig, Item } from "@/api/types";
import { useApp } from "@/store/app";
import { consumeDragClick } from "@/store/drag";
import { KIND_META, STATUS_META } from "@/lib/meta";
import { cn } from "@/lib/cn";
import { Cover } from "@/components/ui/Cover";
import { Stars } from "@/components/ui/Stars";
import { tagsOf } from "./shared";
import { useRows, useWidth } from "./virtual";
import { dragItem } from "./dragDrop";

const MIN_W = { s: 132, m: 176, l: 236 } as const;
const GAP_X = 16, GAP_Y = 20, PAD = 20;
const ratio = (a: CardConfig["aspect"]) => { const [w, h] = a.split("/").map(Number); return w / h; };

/** Virtualised card grid: only rows on screen are rendered, so 10k+ items scroll smoothly. */
export function GalleryView({ items, card }: { items: Item[]; card: CardConfig }) {
  const [wrap, setWrap] = useState<HTMLDivElement | null>(null);
  const width = useWidth(wrap);
  const pad = width < 520 ? 12 : PAD;
  const minW = width < 520 ? Math.min(MIN_W[card.size], card.size === "l" ? 200 : 140) : MIN_W[card.size];
  const inner = Math.max(0, width - pad * 2);
  const cols = Math.max(1, Math.floor((inner + GAP_X) / (minW + GAP_X)));
  const cardW = (inner - GAP_X * (cols - 1)) / cols;
  const textH = (card.showTitle ? 42 : 0) + (card.fields.includes("author") || card.fields.includes("rating") ? 20 : 0) + (card.fields.includes("tags") ? 26 : 0);
  const rowH = cardW / ratio(card.aspect) + textH + GAP_Y;
  const rows = Math.ceil(items.length / cols);
  const v = useRows(rows, rowH || 300, wrap);

  return (
    <div ref={setWrap} className="relative" style={{ height: v.getTotalSize() + PAD * 2 }}>
      {width > 0 &&
        v.getVirtualItems().map((row) => (
          <div
            key={row.key}
            data-index={row.index}
            ref={v.measureElement}
            className="absolute left-0 right-0 grid"
            style={{
              transform: `translateY(${row.start - v.options.scrollMargin + pad}px)`,
              gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
              columnGap: GAP_X,
              padding: `0 ${pad}px ${GAP_Y}px`,
            }}
          >
            {items.slice(row.index * cols, row.index * cols + cols).map((it) => <Card key={it.id} item={it} card={card} />)}
          </div>
        ))}
    </div>
  );
}

function Card({ item, card }: { item: Item; card: CardConfig }) {
  const { select, selectedId, updateItem } = useApp();
  const selected = selectedId === item.id;
  const has = (f: CardConfig["fields"][number]) => card.fields.includes(f);
  const K = KIND_META[item.kind];
  const S = STATUS_META[item.status];
  const authors = tagsOf(item, "author").concat(tagsOf(item, "studio"), tagsOf(item, "circle"));
  const tags = item.tags.filter((t) => t.category === "genre" || t.category === "tag");

  return (
    <div data-item-id={item.id} className="no-callout group min-w-0 cursor-pointer" onContextMenu={(e) => { e.preventDefault(); useApp.getState().openMenu({ x: e.clientX, y: e.clientY, target: { type: "item", id: item.id } }); }} onPointerDown={(e) => dragItem(e, item)} onClick={() => !consumeDragClick() && void select(item.id)}>
      <div
        className={cn(
          "relative overflow-hidden rounded-xl bg-subtle shadow-card ring-1 transition-all duration-150",
          selected ? "ring-2 ring-accent" : "ring-line/60 group-hover:-translate-y-0.5 group-hover:shadow-pop",
        )}
        style={{ aspectRatio: card.aspect }}
      >
        <Cover item={item} fit={card.fit} className="absolute inset-0" iconSize={card.size === "s" ? 24 : 32} />
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/45 via-transparent to-transparent opacity-0 transition-opacity group-hover:opacity-100" />
        <button
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => { e.stopPropagation(); void updateItem(item.id, { favorite: !item.favorite }); }}
          className={cn(
            "touch-show absolute right-1.5 top-1.5 flex h-7 w-7 items-center justify-center rounded-lg bg-black/35 text-white backdrop-blur transition-opacity",
            item.favorite ? "opacity-100" : "opacity-0 group-hover:opacity-100",
          )}
          data-tip={item.favorite ? "즐겨찾기 해제" : "즐겨찾기"}
        >
          <Star size={14} fill={item.favorite ? "#fbbf24" : "none"} className={item.favorite ? "text-amber-400" : ""} />
        </button>
        <div className="absolute bottom-1.5 left-1.5 flex gap-1">
          {has("kind") && (
            <span className="flex h-6 w-6 items-center justify-center rounded-md bg-black/40 text-white backdrop-blur" data-tip={K.label}>
              <K.icon size={13} />
            </span>
          )}
          {has("status") && (
            <span className={cn("flex h-6 w-6 items-center justify-center rounded-md text-white", S.tone)} style={{ background: "rgb(var(--tone) / 0.9)" }} data-tip={S.label}>
              <S.icon size={14} />
            </span>
          )}
          {item.pinned && (
            <span className="flex h-6 w-6 items-center justify-center rounded-md bg-accent text-accent-fg" data-tip="고정됨"><Pin size={12} /></span>
          )}
          {item.code && (
            <span className="flex h-6 items-center rounded-md bg-black/50 px-1.5 font-mono text-[length:calc(10px*var(--ts))] font-semibold text-white backdrop-blur">{item.code}</span>
          )}
        </div>
        {has("files") && item.files.length > 0 && (
          <span className="absolute bottom-1.5 right-1.5 flex h-6 items-center gap-1 rounded-md bg-black/40 px-1.5 text-[length:calc(11px*var(--ts))] font-medium text-white backdrop-blur">
            <Files size={12} />{item.files.length}
          </span>
        )}
      </div>

      {(card.showTitle || has("author") || has("rating") || has("tags")) && (
        <div className="space-y-1 px-0.5 pt-2">
          {card.showTitle && <div className="line-clamp-2 text-[length:calc(13px*var(--ts))] font-medium leading-snug">{item.title}</div>}
          {(has("author") || has("rating")) && (
            <div className="flex items-center justify-between gap-2 text-[length:calc(12px*var(--ts))] text-muted">
              {has("author") && <span className="truncate">{authors.map((a) => a.name).join(", ") || (item.year ?? " ")}</span>}
              {has("rating") && item.rating != null && <Stars value={item.rating} readOnly size={11} />}
            </div>
          )}
          {has("tags") && tags.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {tags.slice(0, 3).map((t) => <span key={t.id} className="chip h-5 text-[length:calc(11px*var(--ts))]">{t.name}</span>)}
              {tags.length > 3 && <span className="chip h-5 text-[length:calc(11px*var(--ts))] text-muted">+{tags.length - 3}</span>}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
