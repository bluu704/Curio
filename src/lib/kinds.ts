import {
  BookMarked, BookOpen, Box, Clapperboard, Feather, Gamepad2, Image, Music, NotebookText, Smartphone, Tag, Tv, type LucideIcon,
} from "lucide-react";
import type { CardAspect, CardField, Kind, Layout, TagCategory } from "@/api/types";

/**
 * Per-archive configuration: how each kind looks and which fields matter.
 * Add a kind = add an entry here (+ Rust enum). Everything else adapts.
 */
export interface KindConfig {
  label: string;
  short: string;
  icon: LucideIcon;
  /** Tag categories shown in the detail panel, with kind-specific labels. */
  tagCats: [TagCategory, string][];
  layout: Layout;
  aspect: CardAspect;
  cardFields: CardField[];
  /** Extra built-in fields shown in the detail panel. */
  showUrl?: boolean;
  showCode?: boolean;
  /** Placeholder for the auto-fill search box. */
  searchHint?: string;
  /** Files of this kind can be opened in the built-in reader. */
  readable?: boolean;
}

export const KIND_CONFIG: Record<Kind, KindConfig> = {
  illust: {
    label: "일러스트", short: "일러스트", icon: Image, layout: "masonry", aspect: "3/4", cardFields: ["rating"],
    tagCats: [["author", "작가"], ["series", "원작"], ["tag", "태그"]], readable: true,
  },
  game: {
    label: "게임", short: "게임", icon: Gamepad2, layout: "gallery", aspect: "2/3", cardFields: ["status", "rating", "author"],
    tagCats: [["studio", "개발사"], ["publisher", "배급사"], ["series", "시리즈"], ["genre", "장르"], ["tag", "태그"]],
    showUrl: true, searchHint: "게임 이름 또는 Steam 상점 주소",
  },
  anime: {
    label: "애니메이션", short: "애니", icon: Tv, layout: "gallery", aspect: "2/3", cardFields: ["status", "rating", "author"],
    tagCats: [["author", "원작"], ["director", "감독"], ["studio", "스튜디오"], ["cast", "성우"], ["series", "시리즈"], ["genre", "장르"], ["tag", "태그"]],
    searchHint: "작품 이름 (영어·일본어·로마자 검색이 정확해요)",
  },
  webtoon: {
    label: "웹툰", short: "웹툰", icon: Smartphone, layout: "gallery", aspect: "3/4", cardFields: ["status", "rating", "author"],
    tagCats: [["author", "작가"], ["publisher", "플랫폼"], ["genre", "장르"], ["tag", "태그"]],
    showUrl: true, searchHint: "작품 이름", readable: true,
  },
  light_novel: {
    label: "라이트노벨", short: "라노벨", icon: BookOpen, layout: "gallery", aspect: "2/3", cardFields: ["status", "rating", "author"],
    tagCats: [["author", "작가·일러스트"], ["publisher", "레이블"], ["series", "시리즈"], ["genre", "장르"], ["tag", "태그"]],
    searchHint: "작품 이름", readable: true,
  },
  web_novel: {
    label: "웹소설", short: "웹소설", icon: NotebookText, layout: "gallery", aspect: "2/3", cardFields: ["status", "rating", "author"],
    tagCats: [["author", "작가"], ["publisher", "플랫폼"], ["genre", "장르"], ["tag", "태그"]],
    showUrl: true, searchHint: "작품 이름", readable: true,
  },
  music: {
    label: "노래", short: "노래", icon: Music, layout: "gallery", aspect: "1/1", cardFields: ["rating", "author"],
    tagCats: [["author", "아티스트"], ["series", "앨범"], ["genre", "장르"], ["tag", "태그"]],
    showUrl: true, searchHint: "YouTube / YouTube Music 주소 또는 곡·아티스트",
  },
  doujin: {
    label: "동인지", short: "동인지", icon: BookMarked, layout: "gallery", aspect: "3/4", cardFields: ["rating", "author", "files"],
    tagCats: [["circle", "서클"], ["author", "작가"], ["cast", "성우"], ["series", "원작"], ["genre", "장르"], ["tag", "태그"]],
    showCode: true, showUrl: true, searchHint: "DLsite 품번 (RJ01234567) 또는 주소", readable: true,
  },
  catalog: {
    label: "품번", short: "품번", icon: Tag, layout: "table", aspect: "3/4", cardFields: ["rating", "author"],
    tagCats: [["studio", "제조사"], ["publisher", "레이블"], ["cast", "출연"], ["series", "시리즈"], ["genre", "장르"], ["tag", "태그"]],
    showCode: true, showUrl: true, searchHint: "품번 (DLsite 품번은 자동 검색)",
  },
  manga: {
    label: "만화", short: "만화", icon: Feather, layout: "gallery", aspect: "2/3", cardFields: ["status", "rating", "author"],
    tagCats: [["author", "작가"], ["publisher", "출판사"], ["series", "시리즈"], ["genre", "장르"], ["tag", "태그"]],
    searchHint: "작품 이름", readable: true,
  },
  movie: {
    label: "영화", short: "영화", icon: Clapperboard, layout: "gallery", aspect: "2/3", cardFields: ["status", "rating"],
    tagCats: [["director", "감독"], ["cast", "출연"], ["studio", "제작사"], ["genre", "장르"], ["tag", "태그"]],
    showUrl: true,
  },
  other: {
    label: "기타", short: "기타", icon: Box, layout: "gallery", aspect: "2/3", cardFields: ["kind", "rating"],
    tagCats: [["author", "작가"], ["tag", "태그"]], showUrl: true,
  },
};

/** Kinds that have their own archive section in the sidebar (in order). */
export const ARCHIVE_KINDS: Kind[] = ["illust", "game", "anime", "webtoon", "light_novel", "web_novel", "music", "doujin", "catalog", "manga", "movie"];

/** View ids of an archive (its own layout/card settings are stored in these views). */
export const viewIdFor = (archiveId: string, list: "archive" | "wishlist") => (list === "archive" ? `arc:${archiveId}` : `arc:${archiveId}:wish`);
