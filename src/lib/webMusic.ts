import type { Candidate } from "@/api/types";
import { ytmTrack } from "./ytm";

/**
 * Song facts the browser may read directly (both sites allow it): YouTube's oEmbed (title, channel)
 * and Apple Music's catalogue (album, first release year, genre, square artwork, length).
 * The desktop app does the same and more (YouTube Music's own data) in Rust.
 */

export const youtubeId = (s: string) =>
  /(?:youtube\.com\/(?:watch\?(?:.*&)?v=|shorts\/|embed\/|live\/)|youtu\.be\/)([A-Za-z0-9_-]{11})/.exec(s)?.[1] ?? null;

const norm = (s: string) => s.toLowerCase().replace(/\(.*?\)|\[.*?\]/g, "").replace(/[\s\p{P}\p{S}]+/gu, "");
/** Same title / name, loosely (one contains the other when long enough). */
export function sameText(a: string, b: string) {
  const x = norm(a), y = norm(b);
  if (!x || !y) return false;
  return x === y || (x.length >= 3 && y.includes(x)) || (y.length >= 3 && x.includes(y));
}

/** "YOASOBI「アイドル」 Official Music Video" → "アイドル", "Artist - Song (Official MV)" → "Song". */
export function cleanTitle(t: string, artist: string) {
  for (const [o, c] of [["「", "」"], ["『", "』"], ["“", "”"]]) {
    const a = t.indexOf(o), b = t.lastIndexOf(c);
    if (a >= 0 && b > a) return t.slice(a + 1, b).trim();
  }
  let s = t.replace(/\s*[([【][^)\]】]*?(official|mv|m\/v|music video|lyric|audio|visualizer|live)[^)\]】]*?[)\]】]/gi, "");
  s = s.replace(/\s*(official\s*(music\s*)?video|official\s*mv|m\/v|mv)\s*$/i, "");
  const dash = s.split(" - ");
  if (dash.length === 2 && sameText(dash[0], artist)) s = dash[1];
  return s.trim();
}

/** A cover video's title → the original song (see the desktop's music::parse_cover). */
export interface Cover { title: string; alts: string[]; artists: string[] }
const COVER = /cover|커버|歌ってみた|唄ってみた|불러\s*(보았|봤|봄)|翻唱/i;
function splitOutside(s: string, sep: string): [string, string] | null {
  let depth = 0;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if ("([（【「『".includes(ch)) depth++;
    else if (")]）】」』".includes(ch)) depth--;
    else if (depth === 0 && s.startsWith(sep, i)) return [s.slice(0, i), s.slice(i + sep.length)];
  }
  return null;
}
export function parseCover(raw: string, singer: string): Cover | null {
  if (!COVER.test(raw)) return null;
  const tag = /[【[(（][^】\])）]*(cover|커버|歌ってみた|唄ってみた|mv|ver\.?|full|short|live|official)[^】\])）]*[】\])）]/gi;
  const feat = /\s*[(（]?\s*(?:feat\.|ft\.|feat\s|ft\s|with\s)[^)）]*[)）]?/gi;
  const n = (x: string) => x.toLowerCase().replace(/\(.*?\)|\[.*?\]/g, "").replace(/[\s\p{P}\p{S}]+/gu, "");
  const singerN = n(singer);
  let core = /[『「]([^』」]+)[』」]/.exec(raw)?.[1]
    ?? raw.split(/[ㅣ|｜]/).map((p) => p.replace(tag, "").trim()).find((p) => { const x = n(p); return !!x && !COVER.test(p) && !(singerN.length >= 2 && (x.includes(singerN) || singerN.includes(x))); })
    ?? "";
  core = core.replace(tag, "").replace(new RegExp(COVER.source, "gi"), "");
  const split = splitOutside(core, " / ");
  const titlePart = split ? split[0] : core;
  const artists = split ? [split[1].replace(feat, "").trim()] : [];
  const alts: string[] = [];
  for (const m of titlePart.matchAll(/[([（]([^)\]）]+)[)\]）]/g)) {
    const inner = m[1].trim();
    if (/^(feat\.?|ft\.?|with)\b/i.test(inner)) continue;
    const ta = inner.includes(" / ") ? inner.split(" / ") : inner.includes("/") ? inner.split("/") : null;
    if (ta) { alts.push(ta[0].trim()); artists.push(ta[1].replace(feat, "").trim()); }
    else { alts.push(inner); artists.push(inner); } // the original title or the original singer: both are tried
  }
  const title = titlePart.replace(/[([（][^)\]）]*[)\]）]/g, "").replace(feat, "").trim().replace(/^[-·\s]+|[-·\s]+$/g, "");
  if (!title) return null;
  return { title, alts, artists: artists.filter((a) => a && !sameText(a, singer)) };
}

const mmss = (sec: number) => `${Math.floor(sec / 60)}:${String(Math.round(sec % 60)).padStart(2, "0")}`;

interface ItunesHit { album: string; year: number | null; genre: string | null; length: string | null; artwork: string | null }

/** Apple Music: the first release of the song (an album beats a single on the same day). */
export async function itunesSong(artist: string, song: string, also: string[] = []): Promise<ItunesHit | null> {
  type H = { trackName?: string; artistName?: string; collectionName?: string; releaseDate?: string; primaryGenreName?: string; trackTimeMillis?: number; artworkUrl100?: string };
  let best: { date: string; h: H } | null = null;
  const single = (h: H) => /\s-\s(Single|EP)$/.test(h.collectionName ?? "");
  for (const country of ["KR", "JP", "US"]) {
    let res: { results?: H[] };
    try {
      res = await (await fetch(`https://itunes.apple.com/search?term=${encodeURIComponent(`${artist} ${song}`.trim())}&entity=song&limit=15&country=${country}`, { signal: AbortSignal.timeout(8000) })).json();
    } catch { continue; }
    for (const h of res.results ?? []) {
      const t = h.trackName ?? "", a = h.artistName ?? "";
      if (!(sameText(t, song) || also.some((x) => sameText(t, x)))) continue;
      if (artist && !(sameText(a, artist) || artist.split(/[,/&]/).some((x) => x.trim() && sameText(a, x.trim())))) continue;
      const date = (h.releaseDate ?? "9999").slice(0, 10);
      if (!best || date < best.date || (date === best.date && single(best.h) && !single(h))) best = { date, h };
    }
    if (best) break;
  }
  if (!best) return null;
  const h = best.h;
  return {
    album: (h.collectionName ?? "").replace(/\s-\s(Single|EP)$/, ""),
    year: Number(best.date.slice(0, 4)) || null,
    genre: h.primaryGenreName ?? null,
    length: h.trackTimeMillis ? mmss(h.trackTimeMillis / 1000) : null,
    artwork: h.artworkUrl100?.replace("100x100bb", "1000x1000bb") ?? null,
  };
}

/** A YouTube link that is not a song: the video itself (title, channel, thumbnail), linked as a video. */
export async function youtubeVideo(url: string): Promise<Candidate | null> {
  const vid = youtubeId(url);
  if (!vid) return null;
  const watch = `https://www.youtube.com/watch?v=${vid}`;
  let o: { title?: string; author_name?: string };
  try { o = await (await fetch(`https://www.youtube.com/oembed?url=${encodeURIComponent(watch)}&format=json`, { signal: AbortSignal.timeout(8000) })).json(); } catch { return null; }
  if (!o.title) return null;
  const thumb = `https://i.ytimg.com/vi/${vid}/hqdefault.jpg`;
  return {
    provider: "youtube-video", id: vid, title: o.title, altTitles: [], kind: "other", year: null, coverUrl: thumb, bannerUrl: thumb, summary: null,
    people: o.author_name ? [{ name: o.author_name, category: "author", role: "Channel" }] : [], genres: [], series: null,
    url: watch, code: null, detail: o.author_name ?? null,
  };
}

/** Songs by title (and singer) from Apple Music, as candidates. */
export async function itunesSearch(query: string): Promise<Candidate[]> {
  type H = { trackId?: number; trackName?: string; artistName?: string; collectionName?: string; releaseDate?: string; primaryGenreName?: string; trackTimeMillis?: number; artworkUrl100?: string; trackViewUrl?: string };
  const out: Candidate[] = [];
  for (const country of ["KR", "JP", "US"]) {
    let res: { results?: H[] };
    try { res = await (await fetch(`https://itunes.apple.com/search?term=${encodeURIComponent(query)}&entity=song&limit=8&country=${country}`, { signal: AbortSignal.timeout(8000) })).json(); } catch { continue; }
    for (const h of res.results ?? []) {
      if (!h.trackName || out.some((c) => c.id === String(h.trackId))) continue;
      const album = (h.collectionName ?? "").replace(/\s-\s(Single|EP)$/, "");
      const year = Number((h.releaseDate ?? "").slice(0, 4)) || null;
      const extra: Record<string, string> = {};
      if (album) extra.album = album;
      if (h.trackTimeMillis) extra.duration = mmss(h.trackTimeMillis / 1000);
      if (year) extra.release = String(year);
      out.push({
        provider: "music", id: String(h.trackId), title: h.trackName, altTitles: [], kind: "music", year,
        coverUrl: h.artworkUrl100?.replace("100x100bb", "1000x1000bb") ?? null, bannerUrl: null, summary: null,
        people: h.artistName ? [{ name: h.artistName, category: "author", role: "Artist" }] : [], genres: h.primaryGenreName ? [h.primaryGenreName] : [],
        // the browser cannot search YouTube Music: the song's Apple Music page is its link here
        series: album || null, url: h.trackViewUrl?.replace(/[?&]uo=\d+/, "") ?? null, code: null, detail: [h.artistName, album, year].filter(Boolean).join(" · "), extra,
      });
    }
    if (out.length) break;
  }
  return out.slice(0, 8);
}

/** A YouTube / YouTube Music link as a song candidate (title, artist, album, year, cover). */
export async function youtubeSong(url: string): Promise<Candidate | null> {
  const vid = youtubeId(url);
  if (!vid) return null;
  const watch = `https://www.youtube.com/watch?v=${vid}`;
  // YouTube Music's own facts (through the site's relay): clean title, artists, album, year, length
  const track = await ytmTrack(vid).catch(() => null);
  let o: { title?: string; author_name?: string } = {};
  try {
    const r = await fetch(`https://www.youtube.com/oembed?url=${encodeURIComponent(watch)}&format=json`, { signal: AbortSignal.timeout(8000) });
    if (r.ok) o = await r.json();
  } catch { /* embedding off: YouTube Music's title below */ }
  const raw = o.title || track?.title || "";
  if (!raw) return null;
  const artist = (track?.artist || o.author_name || "").replace(/\s-\sTopic$/, "").trim();
  const cover = parseCover(raw, artist);
  let song = cover?.title || cleanTitle(raw, o.author_name ?? artist) || raw;
  if (!cover && track?.album && track.title) song = track.title;
  // a cover is the singer's own take: no album / release of the original. Songs: YouTube Music first,
  // Apple Music for what it lacks (music videos have no album there)
  const apple = cover || (track?.album && track.year) ? null : await itunesSong(o.author_name || artist, song, [raw]).catch(() => null);
  const hit = cover ? null : {
    album: track?.album || apple?.album || "", year: track?.year ?? apple?.year ?? null,
    genre: apple?.genre ?? null, length: track?.length || apple?.length || null, artwork: apple?.artwork ?? null,
  };
  const thumb = `https://i.ytimg.com/vi/${vid}/hqdefault.jpg`;
  const extra: Record<string, string> = {};
  if (hit?.album) extra.album = hit.album;
  if (hit?.length) extra.duration = hit.length;
  if (hit?.year) extra.release = String(hit.year);
  if (cover?.artists.length) extra.original_artist = cover.artists.join(", ");
  if (cover?.alts.length) extra.alt_titles = cover.alts.join(" | ");
  return {
    provider: "youtube", id: vid, title: song, altTitles: [...new Set([...(cover?.alts ?? []), ...(raw !== song ? [raw] : [])])], kind: "music",
    year: hit?.year ?? null, coverUrl: hit?.artwork ?? thumb, bannerUrl: thumb, summary: null,
    people: artist ? artist.split(/\s*,\s*/).map((name) => ({ name, category: "author" as const, role: "Artist" })) : [],
    genres: hit?.genre ? [hit.genre] : [], series: hit?.album || null,
    url: `https://music.youtube.com/watch?v=${vid}`, code: null, // a song links to YouTube Music
    // "(…)" may be the original title or its singer: shown as written
    detail: cover ? ["커버", ...new Set([...cover.alts, ...cover.artists])].join(" · ") : hit?.album ? `${hit.album}${hit.year ? ` · ${hit.year}` : ""}` : null,
    extra,
  };
}
