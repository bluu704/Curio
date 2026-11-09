import type { Candidate } from "@/api/types";
import { cleanTitle } from "./webMusic";

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

/** Songs by title: YouTube Music's own uploads ("… - Topic" channels) first, then official videos. */
export async function ytApiSearch(query: string): Promise<Candidate[]> {
  const key = ytKey();
  if (!key) return [];
  type It = { id?: { videoId?: string }; snippet?: { title?: string; channelTitle?: string } };
  let items: It[];
  try {
    const r = await fetch(`https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&videoCategoryId=10&maxResults=10&q=${encodeURIComponent(query)}&key=${encodeURIComponent(key)}`, { signal: AbortSignal.timeout(8000) });
    if (!r.ok) return [];
    items = ((await r.json()) as { items?: It[] }).items ?? [];
  } catch { return []; }
  const rows = items.filter((x) => x.id?.videoId && x.snippet?.title).map((x) => {
    const channel = decode(x.snippet!.channelTitle ?? "");
    const topic = / - Topic$/.test(channel);
    const artist = channel.replace(/ - Topic$/, "").replace(/VEVO$/i, "").replace(/\s*(official|공식)\s*$/i, "").trim();
    const raw = decode(x.snippet!.title!);
    return { vid: x.id!.videoId!, title: topic ? raw : cleanTitle(raw, artist) || raw, raw, artist, topic };
  });
  rows.sort((a, b) => Number(b.topic) - Number(a.topic));
  return rows.slice(0, 8).map((r): Candidate => ({
    provider: "youtube", id: r.vid, title: r.title, altTitles: r.raw !== r.title ? [r.raw] : [], kind: "music", year: null,
    coverUrl: `https://i.ytimg.com/vi/${r.vid}/hqdefault.jpg`, bannerUrl: null, summary: null,
    people: r.artist ? [{ name: r.artist, category: "author", role: "Artist" }] : [], genres: [], series: null,
    url: `https://music.youtube.com/watch?v=${r.vid}`, code: null, detail: ["YouTube", r.artist].filter(Boolean).join(" · "),
  }));
}
