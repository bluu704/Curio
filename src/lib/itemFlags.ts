import type { Archive, FileRef, Item, Kind } from "@/api/types";

/** What new items of an archive are: its own kind, or songs when a plain archive is named like one (노래, 음악…). */
export const archiveKind = (a: Pick<Archive, "kind" | "name"> | undefined | null): Kind =>
  !a ? "other" : a.kind === "other" && isMusicName(a.name) ? "music" : a.kind;

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

const MUSIC_LINK = /music\.youtube\.com|open\.spotify\.com|spotify\.link|soundcloud\.com|deezer\.(com|page\.link)|melon\.com|bugs\.co\.kr|genie\.co\.kr|music\.apple\.com|vibe\.naver\.com|bandcamp\.com|music\.amazon\./i;
const MUSIC_SOURCE = new Set(["youtube", "deezer", "spotify", "soundcloud", "music"]);
/**
 * A song: lyrics, the player and "YouTube에서 재생" show for it. Archives no longer have a "music"
 * kind, so this looks at what the item is: a music link / source, a song file or saved lyrics.
 */
export const isSong = (it: Item, archiveName?: string | null) =>
  it.kind === "music" || !!it.props?._lyrics || MUSIC_SOURCE.has(it.source?.provider ?? "") ||
  MUSIC_LINK.test(it.url ?? "") || it.files.some((f) => f.kind === "audio") || isMusicName(archiveName);

/** An archive whose name says it holds songs (노래, 음악, 플레이리스트, OST, music…). */
export const isMusicName = (name?: string | null) =>
  !!name && /노래|음악|뮤직|가요|팝송|플레이\s?리스트|플리|ost|보컬로이드|보카로|커버곡|싱글|앨범|music|song|playlist|vocaloid|j-?pop|k-?pop/i.test(name);

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
