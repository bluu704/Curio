import type { Candidate } from "@/api/types";

/**
 * YouTube Music for the web version, through the site's own /api/ytm (functions/api/ytm.ts) — the same
 * calls the desktop app makes: song search, a track's album / year / length, and its lyrics
 * (the DeskPlayer extension's way). Every function resolves to null / [] when the relay is not there.
 */
type J = Record<string, unknown> & { [k: string]: any }; // eslint-disable-line @typescript-eslint/no-explicit-any

let down = false;
async function ytm(path: "search" | "next" | "browse", body: object): Promise<J | null> {
  if (down) return null;
  try {
    const r = await fetch(`${import.meta.env.BASE_URL}api/ytm`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ path, body }), signal: AbortSignal.timeout(12000),
    });
    if (r.status === 404 || r.status === 405) { down = true; return null; } // no relay (local preview build)
    if (!r.ok) return null;
    return (await r.json()) as J;
  } catch { return null; }
}

const walk = (o: unknown, key: string, out: J[] = []): J[] => {
  if (Array.isArray(o)) o.forEach((x) => walk(x, key, out));
  else if (o && typeof o === "object") {
    const r = (o as J)[key];
    if (r) out.push(r as J); else Object.values(o as J).forEach((x) => walk(x, key, out));
  }
  return out;
};
const runs = (t: J | undefined) => ((t?.runs as J[] | undefined) ?? []).map((x) => String(x.text ?? "")).join("");
const pageType = (x: J) => String(x?.navigationEndpoint?.browseEndpoint?.browseEndpointContextSupportedConfigs?.browseEndpointContextMusicConfig?.pageType ?? "");
const isArtistRun = (x: J) => pageType(x) === "MUSIC_PAGE_TYPE_ARTIST" || /^UC/.test(String(x?.navigationEndpoint?.browseEndpoint?.browseId ?? ""));
const OFFICIAL = /MUSIC_VIDEO_TYPE_(ATV|OMV|OFFICIAL_SOURCE_MUSIC)/;
const SONGS_TAB = "EgWKAQIIAWoKEAkQBRAKEAMQBA==";

/** One search result row. */
interface Row { vid: string; title: string; artists: string[]; album: string | null; length: string | null; art: string | null; sub: string }
function rows(res: J, officialOnly: boolean): Row[] {
  const out: Row[] = [];
  for (const r of walk(res, "musicResponsiveListItemRenderer")) {
    const raw = JSON.stringify(r);
    if (officialOnly && !OFFICIAL.test(raw)) continue;
    const vid = r.playlistItemData?.videoId ?? /"videoId":"([\w-]{11})"/.exec(raw)?.[1];
    if (!vid || out.some((x) => x.vid === vid)) continue;
    const col = (i: number) => r.flexColumns?.[i]?.musicResponsiveListItemFlexColumnRenderer?.text as J | undefined;
    const sub = (col(1)?.runs as J[] | undefined) ?? [];
    const title = runs(col(0));
    if (!title) continue;
    const thumbs = r.thumbnail?.musicThumbnailRenderer?.thumbnail?.thumbnails as J[] | undefined;
    out.push({
      vid, title, sub: runs(col(1)),
      artists: sub.filter(isArtistRun).map((x) => String(x.text)),
      album: sub.find((x) => pageType(x) === "MUSIC_PAGE_TYPE_ALBUM")?.text ?? null,
      length: sub.map((x) => String(x.text ?? "")).find((t) => /^\d{1,2}:\d{2}$/.test(t)) ?? null,
      art: thumbs?.length ? String(thumbs[thumbs.length - 1].url).replace(/=w\d+-h\d+.*$/, "=w544-h544-l90-rj") : null,
    });
  }
  return out;
}

/** Songs on YouTube Music (its songs tab; where that is empty, the mixed results' official uploads). */
async function searchRows(query: string): Promise<{ list: Row[]; songsTab: boolean }> {
  const songs = await ytm("search", { query, params: SONGS_TAB });
  const a = songs ? rows(songs, false) : [];
  if (a.length) return { list: a, songsTab: true };
  const mixed = await ytm("search", { query });
  return { list: mixed ? rows(mixed, true) : [], songsTab: false };
}

/** Title search for songs, as candidates (a YouTube Music link each). */
export async function ytmSearch(query: string): Promise<Candidate[]> {
  const { list } = await searchRows(query);
  return list.slice(0, 8).map((r): Candidate => ({
    provider: "youtube", id: r.vid, title: r.title, altTitles: [], kind: "music", year: null,
    coverUrl: r.art, bannerUrl: null, summary: null,
    people: r.artists.map((name) => ({ name, category: "author", role: "Artist" })), genres: [], series: r.album,
    url: `https://music.youtube.com/watch?v=${r.vid}`, code: null,
    detail: ["YouTube Music", r.artists[0], r.album, r.length].filter(Boolean).join(" · "),
    extra: { ...(r.album ? { album: r.album } : {}), ...(r.length ? { duration: r.length } : {}) },
  }));
}

/** What YouTube Music says about a track (album / year only for songs, not music videos). */
export async function ytmTrack(vid: string): Promise<{ title: string | null; artist: string | null; album: string | null; year: number | null; length: string | null } | null> {
  const nx = await ytm("next", { videoId: vid, isAudioOnly: true });
  const r = nx ? walk(nx, "playlistPanelVideoRenderer").find((x) => x.videoId === vid) : undefined;
  if (!r) return null;
  const by = (r.longBylineText?.runs as J[] | undefined) ?? [];
  const artists = by.filter((x) => pageType(x) === "MUSIC_PAGE_TYPE_ARTIST").map((x) => String(x.text));
  return {
    title: runs(r.title) || null, artist: artists.join(", ") || null,
    album: by.find((x) => pageType(x) === "MUSIC_PAGE_TYPE_ALBUM")?.text ?? null,
    year: Number(by.map((x) => String(x.text ?? "").trim()).find((t) => /^\d{4}$/.test(t))) || null,
    length: runs(r.lengthText) || null,
  };
}

export interface Lyrics { plain: string; synced: string; source: string }
const lrcTime = (ms: number) => { const t = ms / 1000; return `[${String(Math.floor(t / 60)).padStart(2, "0")}:${(t % 60).toFixed(2).padStart(5, "0")}]`; };

/** The "가사" tab of a YouTube Music song (timed lines when it has them). */
export async function ytmLyrics(vid: string): Promise<Lyrics | null> {
  const nx = await ytm("next", { videoId: vid, isAudioOnly: true });
  const id = nx ? /"browseId":"(MPLY[^"]+)"/.exec(JSON.stringify(nx))?.[1] : undefined;
  if (!id) return null;
  const br = await ytm("browse", { browseId: id });
  if (!br) return null;
  const timed = walk(br, "timedLyricsData")[0] as unknown as J[] | undefined;
  const synced = Array.isArray(timed) ? timed.filter((x) => x?.cueRange?.startTimeMilliseconds != null).map((x) => lrcTime(Number(x.cueRange.startTimeMilliseconds)) + (x.lyricLine ?? "")).join("\n") : "";
  const shelf = walk(br, "musicDescriptionShelfRenderer")[0];
  const plain = shelf ? runs(shelf.description) : "";
  if (!plain.trim() && !synced) return null;
  const src = shelf ? runs(shelf.footer).replace(/^.*?:\s*/, "") : "";
  return { plain: plain.trim() ? plain : synced.replace(/^\s*(\[[0-9:.]+\]\s*)+/gm, ""), synced, source: src ? `YouTube Music · ${src}` : "YouTube Music" };
}

// ---- the extension's findSong
const norm = (s: string) => s.toLowerCase().replace(/\(.*?\)|\[.*?\]/g, "").replace(/[\s\p{P}\p{S}]+/gu, "");
const CJK = /[\p{Script=Hangul}\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/u;
const parts = (s: string) => [...new Set(s.toLowerCase().split(/\s*(?:[,&/·×•()[\]、，＆]|\s및\s|\bfeat\.?|\bft\.?|\bwith\b|\bx\b)\s*/).map(norm))].filter((x) => x.length >= 2);
/** true same singer · false someone else · null can't tell (아이유 ↔ IU, 아카네 리제 ↔ Orangestar) */
export function artistOk(want: string, got: string): boolean | null {
  const A = parts(want), B = parts(got), all = norm(got);
  if (!A.length || !all) return null;
  if (A.some((a) => B.includes(a) || (a.length >= 4 && all.includes(a)) || B.some((b) => b.length >= 4 && a.includes(b)))) return true;
  if (A.some((a) => B.some((b) => CJK.test(a) === CJK.test(b)))) return false;
  return null;
}

export interface SongQuery { title: string; alts: string[]; artists: string[]; duration: number }

/** Video ids of the song on YouTube Music: singer same → yes; can't compare → identical title within 3 s. */
export async function ytmFind(q: SongQuery, title: string): Promise<string[]> {
  const want = norm(title);
  if (!want) return [];
  const { list, songsTab } = await searchRows(`${title} ${q.artists[0] ?? ""}`.trim());
  const long = (x: string) => x.length >= (CJK.test(x) ? 2 : 4);
  const found: { vid: string; rank: number }[] = [];
  list.forEach((r, idx) => {
    const n = norm(r.title);
    const same = n === want, part = (long(want) && n.includes(want)) || (long(n) && want.includes(n));
    const other = !same && !part && CJK.test(want) !== CJK.test(n);
    if (!(same || part || other)) return;
    const v = q.artists.map((a) => artistOk(a, r.artists.join(", ")));
    const m = v.includes(true) ? true : v.length && v.every((x) => x === false) ? false : null;
    const len = /^(\d+):(\d{2})$/.exec(r.length ?? "");
    const secs = len ? Number(len[1]) * 60 + Number(len[2]) : 0;
    const lenOk = q.duration > 0 && secs > 0 && Math.abs(secs - q.duration) <= 3;
    const ok = other ? (m === true || (m === null && songsTab && lenOk)) && idx < 2 : m === true || (m === null && (!q.artists.length || (same && lenOk)));
    if (ok) found.push({ vid: r.vid, rank: m === true ? 0 : 1 });
  });
  return found.sort((a, b) => a.rank - b.rank).slice(0, 5).map((f) => f.vid);
}
