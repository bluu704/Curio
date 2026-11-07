import { create } from "zustand";
import { api } from "@/api";
import type { ID, ItemPatch } from "@/api/types";
import { useApp } from "@/store/app";

/**
 * Several items picked at once (Ctrl/⌘-click, Shift-click for a range, or the card checkbox).
 * Separate from the detail selection: the detail panel still shows one item.
 */
interface PickState {
  ids: Set<ID>;
  last: ID | null;
  toggle(id: ID): void;
  range(id: ID): void;
  set(ids: ID[]): void;
  clear(): void;
}

export const usePick = create<PickState>((set, get) => ({
  ids: new Set(),
  last: null,
  toggle(id) {
    const ids = new Set(get().ids);
    if (ids.has(id)) ids.delete(id); else ids.add(id);
    set({ ids, last: id });
  },
  range(id) {
    const order = useApp.getState().items.map((i) => i.id);
    const from = get().last ? order.indexOf(get().last!) : -1;
    const to = order.indexOf(id);
    if (from < 0 || to < 0) return get().toggle(id);
    const ids = new Set(get().ids);
    for (const x of order.slice(Math.min(from, to), Math.max(from, to) + 1)) ids.add(x);
    set({ ids, last: id });
  },
  set(ids) { set({ ids: new Set(ids), last: ids[ids.length - 1] ?? null }); },
  clear() { if (get().ids.size) set({ ids: new Set(), last: null }); },
}));

/**
 * Click on a card: Ctrl/⌘ toggles, Shift adds a range, and while something is picked a plain click
 * also toggles. Returns true when the click was used for picking (so the card should not open).
 */
export function pickClick(e: React.MouseEvent, id: ID): boolean {
  const p = usePick.getState();
  if (e.shiftKey) { p.range(id); return true; }
  if (e.ctrlKey || e.metaKey || p.ids.size > 0) { p.toggle(id); return true; }
  return false;
}

// ---- bulk actions
const picked = () => [...usePick.getState().ids];

export async function bulkPatch(patch: ItemPatch, msg: string) {
  const ids = picked();
  await Promise.all(ids.map((id) => api.updateItem(id, patch)));
  const s = useApp.getState();
  await s.refresh();
  s.notify(`${ids.length}개 항목 · ${msg}`);
}

export async function bulkFavorite() {
  const ids = picked();
  const items = useApp.getState().items.filter((i) => ids.includes(i.id));
  const on = !items.every((i) => i.favorite); // all already favourite → remove, else add
  await bulkPatch({ favorite: on }, on ? "즐겨찾기에 추가했어요" : "즐겨찾기에서 뺐어요");
}

export async function bulkCategory(catId: ID, name: string) {
  const ids = picked();
  await useApp.getState().addToCategory(ids, catId);
  useApp.getState().notify(`${ids.length}개 항목을 "${name}" 폴더에 넣었어요`);
}

export async function bulkTrash() {
  const ids = picked();
  const s = useApp.getState();
  await Promise.all(ids.map((id) => api.deleteItem(id)));
  usePick.getState().clear();
  if (s.selectedId && ids.includes(s.selectedId)) await s.select(null);
  await s.refresh();
  s.notify(`${ids.length}개 항목을 휴지통으로 옮겼어요`, {
    label: "되돌리기",
    run: () => void Promise.all(ids.map((id) => api.restoreItem(id))).then(() => useApp.getState().refresh()),
  });
}
