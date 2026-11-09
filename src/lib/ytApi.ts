import type { Candidate } from "@/api/types";
import { cleanTitle, itunesSearch, sameText } from "./webMusic";

/**
 * YouTube's official search (YouTube Data API v3) for the web version's song search — the browser may
 * call it directly. Needs a free API key (a browser key, limited to this site in Google Cloud); the
 * free daily quota is about 100 searches. Built in at build time (VITE_YOUTUBE_API_KEY) or entered in
 * Settings → 클라우드.
 */
const KEY = "curio.youtubeKey";
export const ytKey = () => (import.meta.env.VITE_YOUTUBE_API_KEY as string | undefined) || (() => { try { return localStorage.getItem(KEY) ?? ""; } catch { return ""; } })();
export const builtInYtKey = () => !!import.meta.env.VITE_YOUTUBE_API_KEY;
export function setYtKey(v: string) { try { if (v.trim()) localStorage.setItem(KEY, v.trim()); else localStorage.removeItem(KEY); } catch { /* ignore */ } }

const decode = (s: string) => { const t = document.createElement("textarea"); t.innerHTML = s; return t.value; };

/** One search result, read as a song: who sings it and its title, and how official the upload looks. */
export interface YtSong { vid: string; title: string; artist: string; raw: string; channel: string; score: number }

const FAN = /lyric|가사|和訳|中譯|字幕|subtitle|sub\s|번역|cover|커버|歌ってみた|live|라이브|ライブ|concert|콘서트|1\s*hour|type beat|instrumental|karaoke|カラオケ|노래방|remix|sped up|slowed|reaction|first take|piano|피아노|acoustic|8d/i;

function readSong(raw: string, channel: string): { title: string; artist: string } {
  const ch = channel.replace(/ - Topic$/, "").replace(/VEVO$/i, "").replace(/\s*(official|공식)\s*$/i, "").trim();
  if (/ - Topic$/.test(channel)) return { title: raw, artist: ch };
  // YOASOBI「アイドル」 / aespa 에스파 'Supernova' MV / Artist “Song”
  const q = /^(.*?)\s*[「『'‘“"]([^」』'’”"]+)[」』'’”"]/.exec(raw);
  if (q && q[1].trim()) return { title: q[2].trim(), artist: q[1].replace(/\s+[\p{Script=Hangul}]+$/u, "").trim() || ch };
  // Artist - Song (…)
  const d = /^(.+?)\s+[-–ｰー]\s+(.+)$/.exec(raw);
  if (d) return { title: cleanTitle(d[2], "") || d[2], artist: d[1].trim() };
  return { title: cleanTitle(raw, ch) || raw, artist: ch };
}

/** Raw search: one request (100 quota units). */
async function search(query: string): Promise<YtSong[]> {
  const key = ytKey();
  if (!key) return [];
  type It = { id?: { videoId?: string }; snippet?: { title?: string; channelTitle?: string } };
  let items: It[];
  try {
    const r = await fetch(`https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&videoCategoryId=10&maxResults=15&q=${encodeURIComponent(query)}&key=${encodeURIComponent(key)}`, { signal: AbortSignal.timeout(8000) });
    if (!r.ok) return [];
    items = ((await r.json()) as { items?: It[] }).items ?? [];
  } catch { return []; }
  const asked = FAN.test(query); // someone searching for "… live" wants the live one
  return items.filter((x) => x.id?.videoId && x.snippet?.title).map((x) => {
    const raw = decode(x.snippet!.title!), channel = decode(x.snippet!.channelTitle ?? "");
    const { title, artist } = readSong(raw, channel);
    const own = / - Topic$/.test(channel) || sameText(channel.replace(/ - Topic$|VEVO$/gi, ""), artist);
    const score = (own ? 4 : 0) + (/official|공식|MV\b|M\/V/i.test(raw) ? 2 : 0) + (/VEVO$/i.test(channel) ? 1 : 0) - (!asked && FAN.test(raw) ? 4 : 0);
    return { vid: x.id!.videoId!, title, artist, raw, channel, score };
  });
}

/** The best upload of a known song (same title, same singer), most official first. */
function pick(list: YtSong[], title: string, artist: string, taken = new Set<string>()): YtSong | undefined {
  return list
    .filter((s) => !taken.has(s.vid))
    .filter((s) => (sameText(s.title, title) || sameText(s.raw, title)) && (sameText(s.artist, artist) || sameText(s.channel.replace(/ - Topic$/, ""), artist) || s.raw.toLowerCase().includes(artist.toLowerCase())))
    .sort((a, b) => b.score - a.score)[0];
}

const link = (vid: string) => `https://music.youtube.com/watch?v=${vid}`;

/**
 * Songs by title: Apple Music's catalogue gives the clean facts (title, singer, album, year, art);
 * one YouTube search gives each its link — the most official upload of the same song by the same singer.
 * YouTube-only results (nothing in Apple Music) follow.
 */
export async function ytApiSearch(query: string): Promise<Candidate[]> {
  if (!ytKey()) return [];
  const [apple, yt] = await Promise.all([itunesSearch(query).catch(() => []), search(query)]);
  const out: Candidate[] = [];
  const used = new Set<string>();
  const seen = new Set<string>();
  const key = (t: string, a: string) => `${t}\u0001${a}`.toLowerCase();
  for (const a of apple) {
    const artist = a.people[0]?.name ?? "";
    // a remix / live / other version in Apple Music is not the upload of the original found on YouTube
    if (/remix|re:works|live|ver\.|version|inst|acoustic|sped up|slowed/i.test(a.title) && !FAN.test(query)) continue;
    if (seen.has(key(a.title, artist))) continue;
    seen.add(key(a.title, artist));
    const v = pick(yt, a.title, artist, used);
    if (!v) continue; // only songs YouTube has too: their link is what the item needs
    used.add(v.vid);
    out.push({ ...a, provider: "youtube", id: v.vid, url: link(v.vid), detail: ["YouTube", a.detail].filter(Boolean).join(" · ") });
  }
  // YouTube-only songs (not the ones listed above under their Apple Music facts)
  const dup = (v: YtSong) => out.some((c) => sameText(c.title, v.title) && c.people.some((p) => sameText(p.name, v.artist) || v.raw.toLowerCase().includes(p.name.toLowerCase())));
  for (const v of yt.filter((s) => !used.has(s.vid) && s.score > 0 && !dup(s)).sort((a, b) => b.score - a.score)) {
    out.push({
      provider: "youtube", id: v.vid, title: v.title, altTitles: v.raw !== v.title ? [v.raw] : [], kind: "music", year: null,
      coverUrl: `https://i.ytimg.com/vi/${v.vid}/hqdefault.jpg`, bannerUrl: null, summary: null,
      people: v.artist ? [{ name: v.artist, category: "author", role: "Artist" }] : [], genres: [], series: null,
      url: link(v.vid), code: null, detail: ["YouTube", v.channel].filter(Boolean).join(" · "),
    });
  }
  return out.slice(0, 8);
}

/**
 * A song saved with a YouTube Music *search* link: its own address, when the official search finds the
 * same title by the same singer. null when unsure (or no key).
 */
export async function resolveSongLink(title: string, artist: string): Promise<string | null> {
  if (!ytKey() || !title.trim() || !artist.trim()) return null;
  const v = pick(await search(`${artist} ${title}`), title, artist);
  return v ? link(v.vid) : null;
}
