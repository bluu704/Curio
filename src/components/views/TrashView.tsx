import { Menu, RotateCcw, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { api } from "@/api";
import type { TrashedItem } from "@/api/types";
import { useApp } from "@/store/app";
import { relative } from "@/lib/format";
import { iconOf } from "@/lib/icons";
import { Cover } from "@/components/ui/Cover";

/** 휴지통: deleted items stay here for 30 days. Restore or delete for good. */
export function TrashView() {
  const s = useApp();
  const [list, setList] = useState<TrashedItem[] | null>(null);
  const [confirmEmpty, setConfirmEmpty] = useState(false);
  const load = () => void api.listTrash().then(setList);
  useEffect(load, [s.trashCount]);
  const archiveName = (id: string | null) => s.archives.find((a) => a.id === id);
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="flex h-12 shrink-0 items-center gap-2 border-b border-line px-4">
        <button className="btn-icon -ml-2 md:hidden" onClick={() => s.setDrawer(true)} aria-label="메뉴"><Menu size={18} /></button>
        <Trash2 size={17} className="text-muted max-md:hidden" />
        <h1 className="text-[length:calc(14px*var(--ts))] font-semibold">휴지통</h1>
        <span className="rounded-md bg-subtle px-1.5 text-[length:calc(11px*var(--ts))] font-medium tabular-nums text-muted">{list?.length ?? 0}</span>
        <span className="ml-2 text-[length:calc(12px*var(--ts))] text-muted max-sm:hidden">30일이 지나면 자동으로 삭제돼요</span>
        <div className="flex-1" />
        {!!list?.length && (confirmEmpty ? (
          <span className="flex items-center gap-1">
            <button className="btn h-8 bg-danger text-white hover:bg-danger/90" onClick={() => { setConfirmEmpty(false); void s.emptyTrash(); }}>모두 영구 삭제</button>
            <button className="btn h-8 border border-line" onClick={() => setConfirmEmpty(false)}>취소</button>
          </span>
        ) : (
          <button className="btn h-8 border border-line" onClick={() => setConfirmEmpty(true)}><Trash2 size={14} />휴지통 비우기</button>
        ))}
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        {list && !list.length && <div className="mt-20 text-center text-muted">휴지통이 비어 있어요</div>}
        <div className="mx-auto max-w-3xl space-y-1">
          {list?.map((it) => {
            const a = archiveName(it.archiveId);
            const AI = iconOf(a?.icon ?? it.kind);
            return (
              <div key={it.id} className="group flex items-center gap-3 rounded-xl p-2 hover:bg-subtle">
                <Cover item={it} className="h-14 w-10 shrink-0 rounded-md opacity-80" iconSize={16} />
                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium">{it.title}</div>
                  <div className="mt-0.5 flex items-center gap-1.5 text-[length:calc(12px*var(--ts))] text-muted">
                    <AI size={13} />{a?.name ?? "아카이브 없음"} · {relative(it.deletedAt)} 삭제
                  </div>
                </div>
                <button className="btn h-8 border border-line" onClick={() => void s.restoreItem(it.id)}><RotateCcw size={14} />복원</button>
                <button className="btn-icon h-8 w-8 hover:text-danger" data-tip="영구 삭제" onClick={() => void s.purgeItem(it.id)}><Trash2 size={15} /></button>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
