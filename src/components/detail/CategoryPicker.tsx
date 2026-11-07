import { Check, Folder, Plus, X } from "lucide-react";
import type { Category, Item } from "@/api/types";
import { useApp } from "@/store/app";
import { Popover } from "@/components/ui/Popover";
import { cn } from "@/lib/cn";
import { folderColor } from "@/lib/statuses";

/** Chips of the item's folders + a tree popover to toggle membership. */
export function CategoryPicker({ item }: { item: Item }) {
  const { categories, updateItem } = useApp();
  const pool = categories.filter((c) => c.kind === item.kind || c.kind === null);
  const path = (c: Category): string => {
    const p = c.parentId ? categories.find((x) => x.id === c.parentId) : null;
    return p ? `${path(p)} / ${c.name}` : c.name;
  };
  const toggle = (id: string) =>
    void updateItem(item.id, { categoryIds: item.categoryIds.includes(id) ? item.categoryIds.filter((x) => x !== id) : [...item.categoryIds, id] });
  const tree = (pid: string | null, depth: number): React.ReactNode =>
    pool.filter((c) => c.parentId === pid).sort((a, b) => a.position - b.position).map((c) => (
      <div key={c.id}>
        <button className="menu-item h-7" style={{ paddingLeft: 8 + depth * 14 }} onClick={() => toggle(c.id)}>
          <Folder size={13} style={{ color: folderColor(c.color) }} />
          <span className="flex-1 truncate">{c.name}</span>
          {item.categoryIds.includes(c.id) && <Check size={13} className="text-accent" />}
        </button>
        {tree(c.id, depth + 1)}
      </div>
    ));

  return (
    <div className="flex min-h-8 flex-wrap items-center gap-1 py-1">
      {item.categoryIds.map((id) => categories.find((c) => c.id === id)).filter(Boolean).map((c) => (
        <span key={c!.id} className="chip group/chip"><Folder size={11} style={{ color: folderColor(c!.color) }} />{path(c!)}
          <button className="text-muted opacity-0 hover:text-fg group-hover/chip:opacity-100" onClick={() => toggle(c!.id)}><X size={11} /></button>
        </span>
      ))}
      <Popover width={240} trigger={({ toggle: t }) => (
        <button className={cn("flex h-6 w-6 items-center justify-center rounded-md text-muted hover:bg-subtle hover:text-fg")} onClick={t} data-tip="카테고리 지정"><Plus size={14} /></button>
      )}>
        <div className="max-h-64 overflow-y-auto p-1">
          {pool.length ? tree(null, 0) : <div className="px-2 py-1.5 text-[length:calc(12px*var(--ts))] text-muted">왼쪽 카테고리 패널에서 폴더를 먼저 만들어 주세요</div>}
        </div>
      </Popover>
    </div>
  );
}
