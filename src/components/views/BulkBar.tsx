import { Archive, CheckSquare, CircleDot, Folder, FolderInput, Gift, Star, Trash2, X } from "lucide-react";
import { useEffect } from "react";
import { activeView, useApp, viewContext } from "@/store/app";
import { bulkCategory, bulkFavorite, bulkPatch, bulkTrash, usePick } from "@/store/pick";
import { STATUS_META } from "@/lib/meta";
import { folderColor } from "@/lib/statuses";
import { iconOf } from "@/lib/icons";
import { cn } from "@/lib/cn";
import { particle } from "@/lib/josa";
import { Popover } from "@/components/ui/Popover";
import { MenuItem } from "@/components/ui/Menu";

/** Floating bar for the picked items: folder, archive, status, favourite, wishlist, trash. */
export function BulkBar() {
  const s = useApp();
  const ids = usePick((p) => p.ids);
  const n = ids.size;

  // Esc clears, Ctrl/⌘+A picks everything in the view; a new view starts empty
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if (["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName) || el.isContentEditable) return;
      if (e.key === "Escape" && usePick.getState().ids.size) { usePick.getState().clear(); e.stopPropagation(); }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "a" && !useApp.getState().dialog) {
        e.preventDefault();
        usePick.getState().set(useApp.getState().items.map((i) => i.id));
      }
    };
    window.addEventListener("keydown", k, true);
    return () => window.removeEventListener("keydown", k, true);
  }, []);
  useEffect(() => usePick.getState().clear(), [s.activeViewId]);

  if (!n) return null;
  const btn = "flex h-9 items-center gap-1.5 whitespace-nowrap rounded-lg px-2.5 text-[length:calc(13px*var(--ts))] hover:bg-subtle max-sm:px-2";
  const label = "max-sm:hidden";
  const arcId = viewContext(activeView(s)).archiveId;
  const cats = arcId ? s.categories.filter((c) => c.archiveId === arcId) : s.categories;

  return (
    <div className="anim-pop pointer-events-none fixed inset-x-0 bottom-5 z-40 flex justify-center px-3">
      <div className="pointer-events-auto flex max-w-full items-center gap-0.5 overflow-x-auto rounded-2xl border border-line bg-elevated p-1.5 shadow-pop">
        <span className="flex h-9 shrink-0 items-center gap-1.5 rounded-lg bg-accent/10 px-2.5 text-[length:calc(13px*var(--ts))] font-semibold text-accent">
          <CheckSquare size={15} />{n}개
        </span>
        <button className={btn} onClick={() => usePick.getState().set(s.items.map((i) => i.id))} data-tip="모두 선택 (Ctrl+A)"><span>전체</span></button>
        <div className="mx-1 h-5 w-px shrink-0 bg-line" />

        <Popover width={220} trigger={({ toggle }) => <button className={btn} onClick={toggle}><FolderInput size={15} /><span className={label}>폴더</span></button>}>
          {(close) => (
            <div className="max-h-72 overflow-y-auto p-1">
              {cats.length === 0 && <div className="px-2 py-3 text-center text-[length:calc(12px*var(--ts))] text-muted">폴더가 없어요</div>}
              {cats.map((c) => (
                <MenuItem key={c.id} onClick={() => { close(); void bulkCategory(c.id, c.name); }}>
                  <span className="flex items-center gap-2"><Folder size={14} style={{ color: folderColor(c.color) }} />{c.name}</span>
                </MenuItem>
              ))}
            </div>
          )}
        </Popover>

        <Popover width={220} trigger={({ toggle }) => <button className={btn} onClick={toggle}><Archive size={15} /><span className={label}>아카이브</span></button>}>
          {(close) => (
            <div className="max-h-72 overflow-y-auto p-1">
              {s.archives.map((a) => (
                <MenuItem key={a.id} icon={iconOf(a.icon)} onClick={() => { close(); void bulkPatch({ archiveId: a.id, kind: a.kind }, `"${a.name}"${particle(a.name, "으로/로")} 옮겼어요`); }}>{a.name}</MenuItem>
              ))}
            </div>
          )}
        </Popover>

        <Popover width={190} trigger={({ toggle }) => <button className={btn} onClick={toggle}><CircleDot size={15} /><span className={label}>상태</span></button>}>
          {(close) => s.statuses.map((d) => {
            const M = STATUS_META[d.id];
            return (
              <MenuItem key={d.id} onClick={() => { close(); void bulkPatch({ status: d.id }, `상태를 "${M.label}"${particle(M.label, "으로/로")} 바꿨어요`); }}>
                <span className={cn("inline-flex items-center gap-2", M.tone)}><M.icon size={14} className="tone-text" />{M.label}</span>
              </MenuItem>
            );
          })}
        </Popover>

        <button className={btn} onClick={() => void bulkFavorite()} data-tip="즐겨찾기"><Star size={15} /><span className={label}>즐겨찾기</span></button>
        <Popover width={190} trigger={({ toggle }) => <button className={btn} onClick={toggle}><Gift size={15} /><span className={label}>목록</span></button>}>
          {(close) => (
            <>
              <MenuItem icon={Archive} onClick={() => { close(); void bulkPatch({ list: "archive" }, "아카이브로 옮겼어요"); }}>아카이브로</MenuItem>
              <MenuItem icon={Gift} onClick={() => { close(); void bulkPatch({ list: "wishlist" }, "위시리스트로 옮겼어요"); }}>위시리스트로</MenuItem>
            </>
          )}
        </Popover>
        <button className={cn(btn, "text-danger hover:bg-danger/10")} onClick={() => void bulkTrash()} data-tip="휴지통으로"><Trash2 size={15} /><span className={label}>삭제</span></button>
        <div className="mx-1 h-5 w-px shrink-0 bg-line" />
        <button className="btn-icon h-9 w-9 shrink-0" onClick={() => usePick.getState().clear()} data-tip="선택 해제 (Esc)"><X size={16} /></button>
      </div>
    </div>
  );
}
