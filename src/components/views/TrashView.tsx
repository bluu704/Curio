import { ChevronRight, Folder, Menu, RotateCcw, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { api } from "@/api";
import type { TrashedItem, TrashGroup } from "@/api/types";
import { useApp } from "@/store/app";
import { relative } from "@/lib/format";
import { iconOf } from "@/lib/icons";
import { folderColor } from "@/lib/statuses";
import { cn } from "@/lib/cn";
import { Cover } from "@/components/ui/Cover";

/** 휴지통: deleted items, archives and folders stay here for 30 days. Restore or delete for good. */
export function TrashView() {
  const s = useApp();
  const [list, setList] = useState<TrashedItem[] | null>(null);
  const [groups, setGroups] = useState<TrashGroup[]>([]);
  const [open, setOpen] = useState<string | null>(null);
  const [confirmEmpty, setConfirmEmpty] = useState(false);
  const load = () => { void api.listTrash().then(setList); void api.listTrashGroups().then(setGroups); };
  useEffect(load, [s.trashCount]);
  const live = new Set(groups.map((g) => g.id));
  const loose = list?.filter((it) => !it.trashGroup || !live.has(it.trashGroup)) ?? [];
  const total = loose.length + groups.length;
  const archiveOf = (id: string | null) => s.archives.find((a) => a.id === id);

  const ItemRow = ({ it, inner }: { it: TrashedItem; inner?: boolean }) => {
    const a = archiveOf(it.archiveId);
    const AI = iconOf(a?.icon ?? it.kind);
    return (
      <div className={cn("group flex items-center gap-3 rounded-xl p-2 hover:bg-subtle", inner && "ml-7")}>
        <Cover item={it} className="h-14 w-10 shrink-0 rounded-md opacity-80" iconSize={16} />
        <div className="min-w-0 flex-1">
          <div className="truncate font-medium">{it.title}</div>
          {!inner && (
            <div className="mt-0.5 flex items-center gap-1.5 text-[length:calc(12px*var(--ts))] text-muted">
              {a && <><AI size={13} />{a.name} · </>}{relative(it.deletedAt)}
            </div>
          )}
        </div>
        <button className="btn h-8 border border-line" onClick={() => void s.restoreItem(it.id)}><RotateCcw size={14} />복원</button>
        <button className="btn-icon h-8 w-8 hover:text-danger" data-tip="영구 삭제" onClick={() => void s.purgeItem(it.id)}><Trash2 size={15} /></button>
      </div>
    );
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="flex h-12 shrink-0 items-center gap-2 border-b border-line px-4">
        <button className="btn-icon -ml-2 md:hidden" onClick={() => s.setDrawer(true)} aria-label="메뉴"><Menu size={18} /></button>
        <Trash2 size={17} className="text-muted max-md:hidden" />
        <h1 className="text-[length:calc(14px*var(--ts))] font-semibold">휴지통</h1>
        <span className="rounded-md bg-subtle px-1.5 text-[length:calc(11px*var(--ts))] font-medium tabular-nums text-muted">{total}</span>
        <span className="ml-2 text-[length:calc(12px*var(--ts))] text-muted max-sm:hidden">30일 뒤 자동 삭제</span>
        <div className="flex-1" />
        {total > 0 && (confirmEmpty ? (
          <span className="flex items-center gap-1">
            <button className="btn h-8 bg-danger text-white hover:bg-danger/90" onClick={() => { setConfirmEmpty(false); void s.emptyTrash(); }}>모두 영구 삭제</button>
            <button className="btn h-8 border border-line" onClick={() => setConfirmEmpty(false)}>취소</button>
          </span>
        ) : (
          <button className="btn h-8 border border-line" onClick={() => setConfirmEmpty(true)}><Trash2 size={14} />휴지통 비우기</button>
        ))}
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        {list && !total && <div className="mt-20 text-center text-muted">휴지통이 비어 있어요</div>}
        <div className="mx-auto max-w-3xl space-y-1">
          {groups.map((g) => {
            const folder = g.id.startsWith("cat:");
            const GI = folder ? Folder : iconOf(g.icon ?? "library");
            const inside = list?.filter((it) => it.trashGroup === g.id) ?? [];
            const expanded = open === g.id;
            return (
              <div key={g.id}>
                <div className="group flex items-center gap-3 rounded-xl p-2 hover:bg-subtle">
                  <button className="flex min-w-0 flex-1 items-center gap-3 text-left" onClick={() => setOpen(expanded ? null : g.id)} disabled={!inside.length}>
                    <span className="flex h-14 w-10 shrink-0 items-center justify-center rounded-md bg-subtle">
                      <GI size={20} style={folder ? { color: folderColor(g.color) } : undefined} className={folder ? undefined : "text-muted"} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-1 font-medium">
                        <span className="truncate">{g.name}</span>
                        {!!inside.length && <ChevronRight size={14} className={cn("shrink-0 text-muted transition-transform", expanded && "rotate-90")} />}
                      </span>
                      <span className="mt-0.5 block text-[length:calc(12px*var(--ts))] text-muted">
                        {folder ? "폴더" : "아카이브"} · 항목 {g.count}개 · {relative(g.deletedAt)}
                      </span>
                    </span>
                  </button>
                  <button className="btn h-8 border border-line" onClick={() => void s.restoreGroup(g.id)}><RotateCcw size={14} />복원</button>
                  <button className="btn-icon h-8 w-8 hover:text-danger" data-tip="영구 삭제" onClick={() => void s.purgeGroup(g.id)}><Trash2 size={15} /></button>
                </div>
                {expanded && inside.map((it) => <ItemRow key={it.id} it={it} inner />)}
              </div>
            );
          })}
          {loose.map((it) => <ItemRow key={it.id} it={it} />)}
        </div>
      </div>
    </div>
  );
}
