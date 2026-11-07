import type { Item } from "@/api/types";
import { useApp } from "@/store/app";
import { longPress, startItemDrag } from "@/store/drag";

/** Start dragging a card; dropping on a category folder files it there. */
export const dragItem = (e: React.PointerEvent, it: Item) => {
  if (e.pointerType === "touch") {
    longPress(e, (x, y) => useApp.getState().openMenu({ x, y, target: { type: "item", id: it.id } }));
    return;
  }
  startItemDrag(e, [it.id], it.title, (ids, target) => {
    if (target !== "root" && !target.startsWith("cat:")) void useApp.getState().addToCategory(ids, target);
  });
};
