import type { Item } from "@/api/types";
import { activeView, useApp, viewContext } from "@/store/app";

/**
 * Cards dropped in the folder panel: on an archive ("arc:<id>") they move there; on a folder they are
 * filed in it, and — since a folder belongs to one archive — moved to that archive when it is another one.
 */
export function dropItems(ids: string[], target: string) {
  const s = useApp.getState();
  if (target === "root" || target.startsWith("cat:")) return;
  if (target.startsWith("arc:")) { void s.moveToArchive(ids, target.slice(4)); return; }
  void s.addToCategory(ids, target);
  const folderArc = s.categories.find((c) => c.id === target)?.archiveId;
  if (folderArc && !viewContext(activeView(s)).archiveId && s.archives.some((a) => a.id === folderArc)) void s.moveToArchive(ids, folderArc);
}
import { longPress, startItemDrag } from "@/store/drag";
import { usePick } from "@/store/pick";

/** Start dragging a card; dropping on a category folder files it there. */
export const dragItem = (e: React.PointerEvent, it: Item) => {
  if (e.pointerType === "touch") {
    longPress(e, (x, y) => useApp.getState().openMenu({ x, y, target: { type: "item", id: it.id } }));
    return;
  }
  // dragging one of several picked cards moves all of them
  const picked = usePick.getState().ids;
  const ids = picked.has(it.id) ? [...picked] : [it.id];
  startItemDrag(e, ids, ids.length > 1 ? `${it.title} 외 ${ids.length - 1}개` : it.title, dropItems);
};
