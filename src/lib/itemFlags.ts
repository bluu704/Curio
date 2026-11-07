import type { FileRef, Item } from "@/api/types";

/** Per-item switches kept in `item.props` under reserved keys (never shown as properties). */
export const FLAG = { calendarHidden: "_calendarHidden", cloud: "_cloud", main: "_main" } as const;

/** Files that can be an item by themselves: pictures, text/markdown, videos. */
export const isMainKind = (f: FileRef) => f.kind === "image" || f.kind === "text" || f.kind === "video";
/** The file this item *is* (imported from a single picture/text/video), if any. */
export const mainFile = (it: Item): FileRef | undefined => {
  const id = it.props?.[FLAG.main];
  return typeof id === "string" ? it.files.find((f) => f.id === id) : undefined;
};

export const isCalendarHidden = (it: Item) => it.props?.[FLAG.calendarHidden] === true;
export const isCloudSynced = (it: Item) => it.props?.[FLAG.cloud] === true;

/** props patch that sets (or clears) one flag. */
export function withFlag(it: Item, key: string, on: boolean): Record<string, unknown> {
  const p = { ...(it.props ?? {}) };
  if (on) p[key] = true; else delete p[key];
  return p;
}
