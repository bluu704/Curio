import type { Archive, CardConfig, ColumnKey, View } from "@/api/types";
import { viewIdFor } from "./kinds";

export const DEFAULT_CARD: CardConfig = {
  size: "m",
  aspect: "2/3",
  fit: "cover",
  showTitle: true,
  fields: ["status", "rating", "author"],
};

export const DEFAULT_COLUMNS: ColumnKey[] = ["title", "status", "rating", "author", "genre", "files", "updatedAt"];

const base = (id: string, name: string, icon: string, position: number, patch: Partial<View> = {}): View => ({
  id, name, icon, position, layout: "gallery", query: {}, card: { ...DEFAULT_CARD }, columns: [...DEFAULT_COLUMNS], ...patch,
});

/** Built-in views (`sys:` ids, recreated if missing, customisable, not deletable). */
export const DEFAULT_VIEWS: View[] = [
  base("sys:all", "전체", "library", 0, { query: { list: "archive" } }),
  base("sys:fav", "즐겨찾기", "star", 1, { query: { favorite: true } }),
];

/** The archive + wishlist views of one archive. */
export function archiveViews(a: Archive): View[] {
  return [
    base(viewIdFor(a.id, "archive"), a.name, a.icon, 10, { query: { archiveId: a.id, list: "archive" } }),
    base(viewIdFor(a.id, "wishlist"), `${a.name} 위시리스트`, "wish", 11, { query: { archiveId: a.id, list: "wishlist" } }),
  ];
}
