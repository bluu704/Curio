import type { FileRef, Item } from "@/api/types";

/** Per-item switches kept in `item.props` under reserved keys (never shown as properties). */
export const FLAG = { calendarHidden: "_calendarHidden", cloud: "_cloud", main: "_main", fileOrder: "_fileOrder" } as const;

/** The item's files in the order the user arranged them (new files go last). */
export function orderedFiles(it: Item): FileRef[] {
  const order = it.props?.[FLAG.fileOrder];
  if (!Array.isArray(order) || !order.length) return it.files;
  const rank = new Map(order.map((id, i) => [String(id), i]));
  return [...it.files].sort((a, b) => (rank.get(a.id) ?? Infinity) - (rank.get(b.id) ?? Infinity));
}

/** Files that can be an item by themselves: pictures, text/markdown, videos. */
export const isMainKind = (f: FileRef) => f.kind === "image" || f.kind === "text" || f.kind === "video";
/** The file this item *is* (imported from a single picture/text/video), if any. */
export const mainFile = (it: Item): FileRef | undefined => {
  const id = it.props?.[FLAG.main];
  return typeof id === "string" ? it.files.find((f) => f.id === id) : undefined;
};

export const isCalendarHidden = (it: Item) => it.props?.[FLAG.calendarHidden] === true;
/** In the cloud copy (default). Off = this item stays on this device only and leaves Drive. */
export const isCloudSynced = (it: Item) => it.props?.[FLAG.cloud] !== false;
/** props patch for the cloud switch (on = key removed, off = explicit false). */
export function cloudProps(it: Item, on: boolean): Record<string, unknown> {
  const p = { ...(it.props ?? {}) };
  if (on) delete p[FLAG.cloud]; else p[FLAG.cloud] = false;
  return p;
}

/** props patch that sets (or clears) one flag. */
export function withFlag(it: Item, key: string, on: boolean): Record<string, unknown> {
  const p = { ...(it.props ?? {}) };
  if (on) p[key] = true; else delete p[key];
  return p;
}
