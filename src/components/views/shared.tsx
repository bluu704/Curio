import { Inbox } from "lucide-react";
import type { Item, Status, TagCategory } from "@/api/types";
import { STATUS_META } from "@/lib/meta";
import { cn } from "@/lib/cn";
import { Popover } from "@/components/ui/Popover";
import { MenuItem } from "@/components/ui/Menu";
import { useApp } from "@/store/app";

export const tagsOf = (it: Item, cat: TagCategory) => it.tags.filter((t) => t.category === cat);

export function StatusBadge({ status, compact }: { status: Status; compact?: boolean }) {
  const M = STATUS_META[status];
  return (
    <span className={cn("inline-flex h-6 items-center gap-1 rounded-md px-1.5 text-[length:calc(12px*var(--ts))] font-medium tone-bg", M.tone)} data-tip={compact ? M.label : undefined}>
      <M.icon size={13} />
      {!compact && M.label}
    </span>
  );
}

/** Status badge that opens a picker. */
export function StatusPicker({ item, compact }: { item: Item; compact?: boolean }) {
  const update = useApp((s) => s.updateItem);
  return (
    <Popover
      width={160}
      trigger={({ toggle }) => (
        <button onClick={(e) => { e.stopPropagation(); toggle(); }} className="rounded-md hover:brightness-110">
          <StatusBadge status={item.status} compact={compact} />
        </button>
      )}
    >
      {(close) =>
        useApp.getState().statuses.map(({ id: st }) => {
          const M = STATUS_META[st];
          return (
            <MenuItem key={st} checked={item.status === st} onClick={() => { void update(item.id, { status: st }); close(); }}>
              <span className={cn("inline-flex items-center gap-2", M.tone)}><M.icon size={14} className="tone-text" />{M.label}</span>
            </MenuItem>
          );
        })
      }
    </Popover>
  );
}

export function EmptyState() {
  const { search } = useApp();
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 text-center text-muted">
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-subtle"><Inbox size={26} strokeWidth={1.5} /></div>
      <div className="text-[length:calc(14px*var(--ts))] font-medium text-fg">{search ? "검색 결과가 없어요" : "아직 항목이 없어요"}</div>
    </div>
  );
}
