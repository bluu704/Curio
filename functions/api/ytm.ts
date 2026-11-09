/**
 * Cloudflare Pages Function at /api/ytm — lets the web version ask YouTube Music the same questions the
 * desktop app asks (song search, a track's album / year, its lyrics). Browsers may not call YouTube
 * Music directly (no CORS), but this runs on the site's own address.
 *
 * POST { path: "search" | "next" | "browse", body: {...} } → YouTube Music's JSON answer.
 * Only those three read-only calls, only to music.youtube.com: it is not an open proxy.
 */
const ALLOWED = new Set(["search", "next", "browse"]);
const CLIENT = { clientName: "WEB_REMIX", clientVersion: "1.20241106.01.00" };

interface Ctx { request: Request }

export const onRequestPost = async ({ request }: Ctx): Promise<Response> => {
  let q: { path?: string; body?: Record<string, unknown>; hl?: string };
  try {
    if (Number(request.headers.get("content-length") ?? 0) > 8192) throw new Error("too big");
    q = await request.json();
  } catch {
    return new Response("bad request", { status: 400 });
  }
  if (!q.path || !ALLOWED.has(q.path) || typeof q.body !== "object" || !q.body) return new Response("not allowed", { status: 400 });
  const hl = q.hl === "ja" || q.hl === "en" ? q.hl : "ko";
  const gl = hl === "ja" ? "JP" : hl === "en" ? "US" : "KR";
  const { context: _ignored, ...body } = q.body as { context?: unknown };
  const r = await fetch(`https://music.youtube.com/youtubei/v1/${q.path}?prettyPrint=false`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: "https://music.youtube.com",
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36",
    },
    body: JSON.stringify({ context: { client: { ...CLIENT, hl, gl } }, ...body }),
  });
  return new Response(r.body, { status: r.status, headers: { "Content-Type": "application/json", "Cache-Control": "public, max-age=600" } });
};
