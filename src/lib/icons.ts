import {
  Bookmark, BookMarked, BookOpen, Box, Camera, Cat, Clapperboard, Disc3, Feather, Film, Flower2, Gamepad2, Ghost, Gift, Hash,
  Headphones, Heart, Image, Library, Mic2, Music, NotebookText, Palette, Rocket, Shirt, Smartphone, Sparkles, Star, Swords, Tag,
  Trophy, Tv, Gem, Coffee, Plane, Puzzle, type LucideIcon,
} from "lucide-react";

/** Icons an archive / view can use (key stored in DB). Kind keys double as their default icons. */
export const ICONS: Record<string, LucideIcon> = {
  illust: Image, game: Gamepad2, anime: Tv, webtoon: Smartphone, light_novel: BookOpen, web_novel: NotebookText,
  music: Music, doujin: BookMarked, catalog: Tag, manga: Feather, movie: Clapperboard, other: Box,
  library: Library, star: Star, bookmark: Bookmark, hash: Hash, wish: Gift,
  heart: Heart, sparkles: Sparkles, headphones: Headphones, disc: Disc3, mic: Mic2, film: Film, camera: Camera,
  palette: Palette, flower: Flower2, cat: Cat, ghost: Ghost, swords: Swords, trophy: Trophy, rocket: Rocket,
  shirt: Shirt, gem: Gem, coffee: Coffee, plane: Plane, puzzle: Puzzle,
};

/** Order shown in the icon picker. */
export const ICON_CHOICES = [
  "illust", "game", "anime", "webtoon", "light_novel", "web_novel", "music", "doujin", "catalog", "manga", "movie", "other",
  "heart", "star", "sparkles", "bookmark", "headphones", "disc", "mic", "film", "camera", "palette", "flower", "cat",
  "ghost", "swords", "trophy", "rocket", "shirt", "gem", "coffee", "plane", "puzzle", "library",
];

export const iconOf = (key: string | undefined): LucideIcon => (key && ICONS[key]) || Bookmark;
