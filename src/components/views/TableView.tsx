import { Pin, Star } from "lucide-react";
import { useState } from "react";
import { consumeDragClick } from "@/store/drag";
import { useRows } from "./virtual";
import { dragItem } from "./dragDrop";
import { PickBox, usePicked } from "./PickBox";
import { pickClick } from "@/store/pick";
import type { ColumnKey, Item } from "@/api/types";
import { activeView, useApp, viewContext } from "@/store/app";
import { allColumns, normalizeColumn, TITLE_COL, type ColumnDef } from "./columns";
import { cn } from "@/lib/cn";
import { Cover } from "@/components/ui/Cover";

export function TableView({ items, columns }: { items: Item[]; columns: ColumnKey[] }) {
  const fields = useApp((s) => s.fields);
  const arcId = useApp((s) => viewContext(activeView(s)).archiveId ?? null);
  const defs = allColumns(fields, arcId);
  const picked = [...new Set(columns.map(normalizeColumn))].map((k) => defs.find((d) => d.key === k)).filter(Boolean) as ColumnDef[];
  const template = [TITLE_COL.width, ...picked.map((c) => c.width)].join(" ");
  const [wrap, setWrap] = useState<HTMLDivElement | null>(null);
  const v = useRows(items.length, 48, wrap);
  return (
    <div className="min-w-max px-3 pb-6">
      <div className="sticky top-0 z-10 grid border-b border-line bg-bg" style={{ gridTemplateColumns: template }}>
        {[TITLE_COL, ...picked].map((C) => (
          <div key={C.key} className="flex h-9 items-center gap-1.5 whitespace-nowrap px-2.5 text-[length:calc(12px*var(--ts))] font-medium text-muted">
            <C.icon size={13} className="shrink-0" /><span className="truncate">{C.label}</span>
          </div>
        ))}
      </div>
      <div ref={setWrap} className="relative" style={{ height: v.getTotalSize() }}>
        {v.getVirtualItems().map((r) => (
          <div key={r.key} className="absolute inset-x-0" style={{ transform: `translateY(${r.start - v.options.scrollMargin}px)` }}>
            <Row item={items[r.index]} cols={picked} template={template} />
          </div>
        ))}
      </div>
    </div>
  );
}

function Row({ item, cols, template }: { item: Item; cols: ColumnDef[]; template: string }) {
  const { select, selectedId } = useApp();
  const picked = usePicked(item.id);
  const title = (
    <div className="flex min-w-0 items-center gap-2.5">
      <PickBox id={item.id} row className="h-5 w-5" />
      <Cover item={item} className="h-9 w-7 shrink-0 rounded" iconSize={13} />
      {item.code && <span className="shrink-0 rounded bg-subtle px-1.5 font-mono text-[length:calc(11px*var(--ts))] text-muted">{item.code}</span>}
      <span className="truncate font-medium">{item.title}</span>
      {item.pinned && <Pin size={12} className="shrink-0 text-accent" />}
      {item.favorite && <Star size={12} className="shrink-0 text-amber-400" fill="currentColor" />}
    </div>
  );
  return (
    <div
      data-item-id={item.id}
      onPointerDown={(e) => dragItem(e, item)}
      onContextMenu={(e) => { e.preventDefault(); useApp.getState().openMenu({ x: e.clientX, y: e.clientY, target: { type: "item", id: item.id } }); }}
      onClick={(e) => { if (consumeDragClick() || pickClick(e, item.id)) return; void select(item.id); }}
      className={cn(
        "group grid h-12 cursor-pointer border-b border-line/60 transition-colors",
        selectedId === item.id || picked ? "bg-accent/10" : "hover:bg-subtle/70",
      )}
      style={{ gridTemplateColumns: template }}
    >
      <div className="flex h-[47px] min-w-0 items-center px-2.5">{title}</div>
      {cols.map((c) => <div key={c.key} className="flex h-[47px] min-w-0 items-center px-2.5">{c.render(item)}</div>)}
    </div>
  );
}
