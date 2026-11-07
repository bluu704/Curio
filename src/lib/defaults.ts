import type { Archive, CardConfig, ColumnKey, View } from "@/api/types";
import { KIND_CONFIG, viewIdFor } from "./kinds";
import { formatOfArchive } from "./formats";

export const DEFAULT_CARD: CardConfig = {
  size: "m",
  aspect: "2/3",
  fit: "cover",
  showTitle: true,
  fields: ["kind", "status", "rating", "author"],
};

export const DEFAULT_COLUMNS: ColumnKey[] = ["title", "kind", "status", "rating", "author", "genre", "files", "updatedAt"];

const base = (id: string, name: string, icon: string, position: number, patch: Partial<View> = {}): View => ({
  id, name, icon, position, layout: "gallery", query: {}, card: { ...DEFAULT_CARD }, columns: [...DEFAULT_COLUMNS], ...patch,
});

/** Built-in views (`sys:` ids, recreated if missing, customisable, not deletable). */
export const DEFAULT_VIEWS: View[] = [
  base("sys:all", "전체", "library", 0, { query: { list: "archive" } }),
  base("sys:fav", "즐겨찾기", "star", 1, { query: { favorite: true } }),
];

/** The archive + wishlist views of one archive (layout from its kind template). */
export function archiveViews(a: Archive): View[] {
  const f = formatOfArchive(a);
  const c = { layout: f.layout, aspect: f.aspect, cardFields: KIND_CONFIG[f.base].cardFields };
  const card: CardConfig = { ...DEFAULT_CARD, aspect: c.aspect, fields: c.cardFields };
  const columns: ColumnKey[] = a.kind === "catalog" ? ["title", "status", "rating", "author", "tag", "updatedAt"] : DEFAULT_COLUMNS.filter((x) => x !== "kind");
  return [
    base(viewIdFor(a.id, "archive"), a.name, a.icon, 10, { layout: c.layout, query: { archiveId: a.id, list: "archive" }, card, columns }),
    base(viewIdFor(a.id, "wishlist"), `${a.name} 위시리스트`, "wish", 11, { layout: c.layout === "masonry" ? "masonry" : "gallery", query: { archiveId: a.id, list: "wishlist" }, card, columns }),
  ];
}
