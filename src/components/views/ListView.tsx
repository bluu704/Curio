import { Files, Pin, Star } from "lucide-react";
import { useState } from "react";
import { consumeDragClick } from "@/store/drag";
import { useRows } from "./virtual";
import { dragItem } from "./dragDrop";
import { PickBox } from "./PickBox";
import { pickClick, usePick } from "@/store/pick";
import type { CardConfig, Item } from "@/api/types";
import { useApp } from "@/store/app";
import { KIND_META } from "@/lib/meta";
import { relative } from "@/lib/format";
import { cn } from "@/lib/cn";
import { Cover } from "@/components/ui/Cover";
import { Stars } from "@/components/ui/Stars";
import { StatusBadge, tagsOf } from "./shared";

export function ListView({ items, card }: { items: Item[]; card: CardConfig }) {
  const { select, selectedId } = useApp();
  const picks = usePick((p) => p.ids);
  const has = (f: CardConfig["fields"][number]) => card.fields.includes(f);
  const [wrap, setWrap] = useState<HTMLDivElement | null>(null);
  const v = useRows(items.length, 76, wrap);
  return (
    <div ref={setWrap} className="relative mx-auto max-w-4xl" style={{ height: v.getTotalSize() + 32 }}>
      {v.getVirtualItems().map((row) => {
        const it = items[row.index];
        const K = KIND_META[it.kind];
        const others = it.tags.filter((t) => t.category === "genre" || t.category === "tag");
        return (
          <div
            key={it.id}
            data-item-id={it.id}
            onPointerDown={(e) => dragItem(e, it)}
            onContextMenu={(e) => { e.preventDefault(); useApp.getState().openMenu({ x: e.clientX, y: e.clientY, target: { type: "item", id: it.id } }); }}
            onClick={(e) => { if (consumeDragClick() || pickClick(e, it.id)) return; void select(it.id); }}
            className={cn(
              "group absolute inset-x-4 top-4 flex h-[72px] cursor-pointer items-center gap-3 rounded-xl p-2 transition-colors",
              selectedId === it.id || picks.has(it.id) ? "bg-accent/10" : "hover:bg-subtle",
            )}
            style={{ transform: `translateY(${row.start - v.options.scrollMargin}px)` }}
          >
            <PickBox id={it.id} row />
            <Cover item={it} className="h-14 w-10 shrink-0 rounded-md" iconSize={16} />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <span className="truncate font-medium">{it.title}</span>
                {it.pinned && <Pin size={12} className="shrink-0 text-accent" />}
                {it.favorite && <Star size={12} className="shrink-0 text-amber-400" fill="currentColor" />}
              </div>
              <div className="mt-0.5 flex items-center gap-2 text-[length:calc(12px*var(--ts))] text-muted">
                {has("kind") && <K.icon size={13} />}
                {has("author") && <span className="truncate">{[...tagsOf(it, "author"), ...tagsOf(it, "studio"), ...tagsOf(it, "circle")].map((a) => a.name).join(", ")}</span>}
                {it.code && <span className="font-mono text-[length:calc(11px*var(--ts))]">{it.code}</span>}
                {has("tags") && others.slice(0, 3).map((t) => <span key={t.id} className="chip h-5 text-[length:calc(11px*var(--ts))]">{t.name}</span>)}
              </div>
            </div>
            {has("files") && it.files.length > 0 && <span className="flex items-center gap-1 text-[length:calc(12px*var(--ts))] text-muted"><Files size={13} />{it.files.length}</span>}
            {has("rating") && <Stars value={it.rating} readOnly size={12} />}
            {has("status") && <StatusBadge status={it.status} compact />}
            <span className="w-16 text-right text-[length:calc(11px*var(--ts))] text-muted">{relative(it.updatedAt)}</span>
          </div>
        );
      })}
    </div>
  );
}
