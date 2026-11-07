import type { Kind } from "@/api/types";

/** Kind implied by a link (YouTube → 노래, X·유튜브 게시물 → 일러스트, Steam/Play → 게임…). */
export function kindFromLink(s: string): Kind | null {
  // posts (images) before the generic YouTube rule
  if (/(?:^|\/\/|\.)(?:x|twitter|fxtwitter|vxtwitter|fixupx)\.com\/\w+\/status/i.test(s)) return "illust";
  if (/youtube\.com\/(?:post\/|.*community\?(?:.*&)?lb=)/i.test(s)) return "illust";
  if (/youtu\.?be|music\.youtube/i.test(s)) return "music";
  if (/open\.spotify\.com|spotify\.link|soundcloud\.com|deezer\.(com|page\.link)|melon\.com|bugs\.co\.kr|genie\.co\.kr|music\.apple\.com|vibe\.naver\.com|bandcamp\.com|music\.amazon\./i.test(s)) return "music";
  if (/steampowered\.com|play\.google\.com|onstove\.com|vndb\.org/i.test(s)) return "game";
  if (/comic\.naver\.com|webtoons?\.com|webtoon\.kakao/i.test(s)) return "webtoon";
  if (/series\.naver\.com|page\.kakao|ridibooks|novelpia|munpia/i.test(s)) return "web_novel";
  if (/anilist\.co\/anime|laftel|myanimelist\.net\/anime|kitsu\.(io|app)\/anime/i.test(s)) return "anime";
  if (/pixiv\.net|artstation|deviantart/i.test(s)) return "illust";
  if (/tvmaze\.com|netflix\.com|tving|wavve|coupangplay/i.test(s)) return "drama";
  if (/openlibrary\.org|books\.google|yes24|aladin|kyobobook/i.test(s)) return "book";
  return null;
}

