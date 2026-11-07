import type { Item } from "@/api/types";

/** Per-item switches kept in `item.props` under reserved keys (never shown as properties). */
export const FLAG = { calendarHidden: "_calendarHidden", cloud: "_cloud" } as const;

export const isCalendarHidden = (it: Item) => it.props?.[FLAG.calendarHidden] === true;
export const isCloudSynced = (it: Item) => it.props?.[FLAG.cloud] === true;

/** props patch that sets (or clears) one flag. */
export function withFlag(it: Item, key: string, on: boolean): Record<string, unknown> {
  const p = { ...(it.props ?? {}) };
  if (on) p[key] = true; else delete p[key];
  return p;
}
