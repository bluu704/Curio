import { orderedFiles } from "@/lib/itemFlags";
import { useEffect } from "react";
import { create } from "zustand";
import { useApp, activeView } from "@/store/app";
import { isReadable } from "@/components/reader/source";

/** Rebindable actions. Number keys 1–9 (status) and Esc (close) are fixed. */
export type ActionId =
  | "rename" | "newItem" | "search" | "prev" | "next" | "favorite" | "pin" | "wishlist" | "read" | "delete" | "sidebar" | "settings";

export const ACTIONS: { id: ActionId; label: string; keys: string[] }[] = [
  { id: "rename", label: "이름 바꾸기 (선택한 폴더 · 열린 항목 · 아카이브)", keys: ["F2"] },
  { id: "newItem", label: "새 항목", keys: ["Ctrl+N"] },
  { id: "search", label: "검색", keys: ["Ctrl+F"] },
  { id: "prev", label: "이전 항목", keys: ["ArrowLeft", "ArrowUp"] },
  { id: "next", label: "다음 항목", keys: ["ArrowRight", "ArrowDown"] },
  { id: "favorite", label: "즐겨찾기", keys: ["F"] },
  { id: "pin", label: "고정 · 고정 해제", keys: ["P"] },
  { id: "wishlist", label: "위시리스트 ↔ 아카이브", keys: ["W"] },
  { id: "read", label: "뷰어로 읽기", keys: ["R"] },
  { id: "delete", label: "휴지통으로 이동", keys: ["Delete"] },
  { id: "sidebar", label: "왼쪽 메뉴 접기 · 펼치기", keys: ["Ctrl+B"] },
  { id: "settings", label: "설정", keys: ["Ctrl+,"] },
];
export const FIXED: [string, string][] = [["1 ~ 9", "상태 바꾸기 (설정의 순서대로)"], ["Esc", "닫기"]];

const KEY = "curio.keymap";
const defaults = (): Record<ActionId, string[]> => Object.fromEntries(ACTIONS.map((a) => [a.id, a.keys])) as Record<ActionId, string[]>;
const load = (): Record<ActionId, string[]> => {
  try { return { ...defaults(), ...JSON.parse(localStorage.getItem(KEY) ?? "{}") }; } catch { return defaults(); }
};

/** "Ctrl+Shift+K" style string for a keyboard event (Cmd counts as Ctrl). null for bare modifiers. */
export function comboOf(e: KeyboardEvent | React.KeyboardEvent): string | null {
  if (["Control", "Shift", "Alt", "Meta"].includes(e.key)) return null;
  const k = e.key.length === 1 ? e.key.toUpperCase() : e.key;
  return [(e.ctrlKey || e.metaKey) && "Ctrl", e.altKey && "Alt", e.shiftKey && k.length > 1 && "Shift", k].filter(Boolean).join("+");
}

const pretty: Record<string, string> = { ArrowLeft: "←", ArrowRight: "→", ArrowUp: "↑", ArrowDown: "↓", " ": "Space" };
export const prettyCombo = (c: string) => c.split("+").map((p) => pretty[p] ?? p).join(" + ");

export const useKeymap = create<{
  map: Record<ActionId, string[]>;
  bind(id: ActionId, combo: string): ActionId | null;
  reset(id?: ActionId): void;
}>((set, get) => ({
  map: load(),
  /** Assign `combo` to `id`; removes it from any other action. Returns that other action (to tell the user). */
  bind(id, combo) {
    const map = { ...get().map };
    let taken: ActionId | null = null;
    for (const a of Object.keys(map) as ActionId[]) {
      if (a !== id && map[a].includes(combo)) { map[a] = map[a].filter((c) => c !== combo); taken = a; }
    }
    map[id] = [combo];
    try { localStorage.setItem(KEY, JSON.stringify(map)); } catch { /* ignore */ }
    set({ map });
    return taken;
  },
  reset(id) {
    const map = id ? { ...get().map, [id]: defaults()[id] } : defaults();
    try { localStorage.setItem(KEY, JSON.stringify(map)); } catch { /* ignore */ }
    set({ map });
  },
}));

const typing = (t: EventTarget | null) => {
  const el = t as HTMLElement | null;
  return !!el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT" || el.isContentEditable);
};

/** Set while the settings screen is recording a new key (shortcuts are paused). */
export const recording = { on: false };

export function useShortcuts() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (recording.on) return;
      const s = useApp.getState();
      const combo = comboOf(e);
      if (!combo) return;
      const action = (Object.entries(useKeymap.getState().map) as [ActionId, string[]][]).find(([, ks]) => ks.includes(combo))?.[0];
      const global = action === "sidebar" || action === "settings" || action === "newItem" || action === "search";
      if (s.reader || s.dialog || s.menu || (s.settingsOpen && action !== "settings")) return; // those own the keyboard
      if (typing(e.target) && !(global && combo.includes("Ctrl"))) return;

      const item = s.detail;
      const go = (d: number) => {
        if (!s.items.length) return;
        const i = s.items.findIndex((x) => x.id === s.selectedId);
        const next = s.items[Math.max(0, Math.min(s.items.length - 1, i < 0 ? 0 : i + d))];
        void s.select(next.id);
        requestAnimationFrame(() => document.querySelector(`[data-item-id="${next.id}"]`)?.scrollIntoView({ block: "nearest" }));
      };

      if (!action) {
        if (item && /^[1-9]$/.test(combo)) {
          const st = s.statuses[Number(combo) - 1];
          if (st) { void s.updateItem(item.id, { status: st.id }); s.notify(`상태: ${st.label}`); }
        }
        return;
      }
      e.preventDefault();
      switch (action) {
        case "sidebar": return s.toggleSidebar();
        case "settings": return s.setSettingsOpen(true);
        case "newItem": return void s.createItem({ title: "제목 없음" });
        case "search": return document.querySelector<HTMLInputElement>("[data-search-input]")?.focus();
        case "prev": return go(-1);
        case "next": return go(1);
        case "rename": {
          // the folder just clicked in the folder panel
          if (s.lastPicked === "folder" && s.categoryId && s.showCategories) { useApp.setState({ renameFolderId: s.categoryId }); return; }
          const title = document.querySelector<HTMLTextAreaElement>("[data-title-input]");
          if (item && title) { title.focus(); title.select(); return; }
          const v = activeView(s);
          const h = document.querySelector("header h1")?.getBoundingClientRect();
          const x = h?.left ?? 240, y = (h?.bottom ?? 40) + 6;
          if (v.query.archiveId && v.query.list !== "wishlist") s.openMenu({ x, y, target: { type: "archive", id: v.query.archiveId } });
          else if (!v.id.startsWith("sys:") && !v.id.startsWith("arc:")) s.openMenu({ x, y, target: { type: "view", id: v.id } });
          return;
        }
      }
      if (!item) return;
      switch (action) {
        case "favorite": return void s.updateItem(item.id, { favorite: !item.favorite });
        case "pin": s.notify(item.pinned ? "고정 해제" : "고정했어요"); return void s.updateItem(item.id, { pinned: !item.pinned });
        case "wishlist": return void s.updateItem(item.id, { list: item.list === "wishlist" ? "archive" : "wishlist" });
        case "read": { const f = orderedFiles(item).find(isReadable); if (f) s.openReader(item, f); return; }
        case "delete": return void s.deleteItem(item.id);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
}
