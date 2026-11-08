import {
  Bookmark, BookMarked, BookOpen, Box, Camera, Cat, Clapperboard, Disc3, Feather, Film, Flower2, Gamepad2, Ghost, Gift, Hash,
  Headphones, Heart, Image, Library, Mic2, Music, NotebookText, Palette, Rocket, Shirt, Smartphone, Sparkles, Star, Swords, Tag,
  Trophy, Tv, Gem, Coffee, Plane, Puzzle, type LucideIcon,
  Anchor, Apple, Atom, Baby, Backpack, Banana, Bike, Bird, Book, BookHeart, Brush, Bug, Cake, Car, Castle, Cherry, Clover, Cloud,
  Cookie, Crown, Diamond, Dices, Dog, Drama, Feather as Quill, Fish, Flame, Flag, Gamepad, Ghost as Spook, Glasses, Guitar, Hammer,
  IceCream, Joystick, Key, Lamp, Leaf, Lightbulb, MapPin, Medal, Megaphone, Moon, Mountain, Newspaper, Origami, Paintbrush, PawPrint,
  Pencil, Piano, Pizza, Popcorn, Radio, Rabbit, Rainbow, Sailboat, School, Scroll, Shield, Skull, Snowflake, Sofa, Sprout, Sun,
  CirclePlay, CircleCheck, CirclePause, CircleX, Clock, Hourglass, Eye, Repeat,
  Sword, Tent, Theater, TreePine, Umbrella, Utensils, Wand2, Watch, Wine, Zap, Images, Video, Tags, Tag as Label, Package,
  UserRound, Users, Folder, Link2, CalendarDays, CalendarPlus, Layers, Shapes, Building2, Globe, Languages, Timer, ListOrdered,
  Barcode, MapPinned, Coins, Award, Ruler,
} from "lucide-react";
import { createElement, forwardRef } from "react";

/** Icons an archive / view can use (key stored in DB). Kind keys double as their default icons. */
export const ICONS: Record<string, LucideIcon> = {
  illust: Image, game: Gamepad2, anime: Tv, webtoon: Smartphone, light_novel: BookOpen, web_novel: NotebookText,
  music: Music, doujin: BookMarked, catalog: Tag, manga: Feather, movie: Clapperboard, other: Box,
  library: Library, star: Star, bookmark: Bookmark, hash: Hash, wish: Gift,
  heart: Heart, sparkles: Sparkles, headphones: Headphones, disc: Disc3, mic: Mic2, film: Film, camera: Camera,
  palette: Palette, flower: Flower2, cat: Cat, ghost: Ghost, swords: Swords, trophy: Trophy, rocket: Rocket,
  shirt: Shirt, gem: Gem, coffee: Coffee, plane: Plane, puzzle: Puzzle,
  anchor: Anchor, apple: Apple, atom: Atom, baby: Baby, backpack: Backpack, banana: Banana, bike: Bike, bird: Bird, book: Book,
  bookheart: BookHeart, brush: Brush, bug: Bug, cake: Cake, car: Car, castle: Castle, cherry: Cherry, clover: Clover, cloud: Cloud,
  cookie: Cookie, crown: Crown, diamond: Diamond, dice: Dices, dog: Dog, drama: Drama, quill: Quill, fish: Fish, flame: Flame,
  flag: Flag, gamepad: Gamepad, spook: Spook, glasses: Glasses, guitar: Guitar, hammer: Hammer, icecream: IceCream, joystick: Joystick,
  key: Key, lamp: Lamp, leaf: Leaf, bulb: Lightbulb, pin: MapPin, medal: Medal, megaphone: Megaphone, moon: Moon, mountain: Mountain,
  news: Newspaper, origami: Origami, paintbrush: Paintbrush, paw: PawPrint, pencil: Pencil, piano: Piano, pizza: Pizza, popcorn: Popcorn,
  radio: Radio, rabbit: Rabbit, rainbow: Rainbow, sailboat: Sailboat, school: School, scroll: Scroll, shield: Shield, skull: Skull,
  snowflake: Snowflake, sofa: Sofa, sprout: Sprout, sun: Sun, sword: Sword, tent: Tent, theater: Theater, tree: TreePine,
  umbrella: Umbrella, utensils: Utensils, wand: Wand2, watch: Watch, wine: Wine, zap: Zap, images: Images, video: Video, tags: Tags,
  label: Label, package: Package,
  // property icons
  user: UserRound, users: Users, folder: Folder, link: Link2, calendar: CalendarDays, calendarplus: CalendarPlus, layers: Layers,
  shapes: Shapes, building: Building2, globe: Globe, languages: Languages, timer: Timer, list: ListOrdered, barcode: Barcode,
  place: MapPinned, coins: Coins, award: Award, ruler: Ruler,
  // status icons (also usable anywhere)
  play: CirclePlay, check: CircleCheck, pause: CirclePause, x: CircleX, clock: Clock, hourglass: Hourglass, eye: Eye, repeat: Repeat,
};

/** Words (Korean / English) that bring an icon up as a suggestion while a name is typed. */
const ICON_WORDS: Record<string, string[]> = {
  illust: ["일러스트", "그림", "이미지", "사진", "art", "illust", "image"], images: ["사진", "갤러리", "앨범", "photo", "gallery"],
  camera: ["사진", "카메라", "촬영", "photo"], palette: ["그림", "미술", "아트", "색", "art", "paint"], brush: ["그림", "드로잉", "draw"],
  game: ["게임", "game", "플스", "닌텐도", "스팀"], gamepad: ["게임", "콘솔", "game"], joystick: ["게임", "레트로", "아케이드"], dice: ["보드게임", "trpg", "주사위"],
  anime: ["애니", "애니메이션", "tv", "방송", "anime"], film: ["영화", "film", "movie", "시네마"], movie: ["영화", "movie", "드라마", "영상"], video: ["영상", "동영상", "video", "유튜브", "클립"],
  theater: ["연극", "뮤지컬", "공연", "theater"], drama: ["드라마", "연극", "drama"], popcorn: ["영화", "극장"],
  webtoon: ["웹툰", "webtoon", "모바일"], manga: ["만화", "manga", "코믹"], book: ["책", "도서", "소설", "book", "독서"], bookheart: ["책", "로맨스", "소설"],
  light_novel: ["라노벨", "라이트노벨", "소설", "novel"], web_novel: ["웹소설", "소설", "연재"], library: ["서재", "아카이브", "라이브러리", "library", "책장", "보관"],
  doujin: ["동인", "동인지", "회지", "doujin"], quill: ["시", "글", "에세이", "작가"], scroll: ["기록", "문서", "역사"], news: ["뉴스", "기사", "신문"],
  music: ["노래", "음악", "music", "song", "곡", "플레이리스트"], headphones: ["음악", "노래", "듣기", "팟캐스트"], disc: ["앨범", "음반", "cd", "레코드"],
  mic: ["보컬", "가수", "노래방", "성우", "팟캐스트", "녹음"], guitar: ["기타", "밴드", "악기"], piano: ["피아노", "악기", "클래식"], radio: ["라디오", "방송"],
  catalog: ["품번", "코드", "상품"], package: ["굿즈", "택배", "상품", "물건", "구매"], gem: ["보석", "수집", "레어"], trophy: ["업적", "트로피", "수상"], award: ["수상", "상", "award"],
  shirt: ["옷", "패션", "의류", "굿즈"], coffee: ["카페", "커피"], utensils: ["음식", "요리", "맛집", "레시피"], pizza: ["음식", "먹방"], cake: ["디저트", "케이크", "생일"],
  plane: ["여행", "항공", "travel"], place: ["장소", "여행", "지도"], tent: ["캠핑", "여행"], mountain: ["등산", "산", "여행"],
  heart: ["좋아요", "최애", "덕질", "favorite", "사랑"], star: ["즐겨찾기", "별", "추천", "favorite"], sparkles: ["특별", "반짝", "새로운"], wish: ["위시", "선물"],
  cat: ["고양이", "냥", "cat"], dog: ["강아지", "개", "dog"], paw: ["동물", "반려"], ghost: ["호러", "공포", "귀신"], skull: ["호러", "공포"], swords: ["액션", "전투", "rpg"], shield: ["방어", "rpg"],
  rocket: ["sf", "우주", "공상과학"], atom: ["과학", "sf"], wand: ["판타지", "마법"], castle: ["판타지", "성"], crown: ["왕", "명작", "베스트"],
  user: ["작가", "사람", "인물", "아티스트", "저자", "author", "artist"], users: ["멤버", "그룹", "서클", "출연", "인물들"], building: ["회사", "스튜디오", "제작사", "개발사", "출판사"],
  megaphone: ["배급", "홍보", "레이블", "출판"], layers: ["시리즈", "묶음", "series"], shapes: ["장르", "분류", "genre"], hash: ["태그", "번호", "tag"], label: ["태그", "라벨"],
  link: ["링크", "주소", "url", "사이트"], globe: ["웹", "사이트", "국가", "언어", "해외"], languages: ["언어", "번역", "자막"], calendar: ["연도", "날짜", "출시", "발매", "일정"],
  calendarplus: ["추가일", "등록"], timer: ["시간", "러닝타임", "플레이타임", "분"], list: ["화수", "회차", "에피소드", "권수", "순서", "번호"], barcode: ["품번", "isbn", "바코드", "코드"],
  coins: ["가격", "금액", "구매가", "돈", "원"], ruler: ["크기", "사이즈", "길이", "페이지"], folder: ["폴더", "위치", "보관"], check: ["상태", "완료"], eye: ["감상", "봄", "시청"],
  clock: ["시간", "기간"], pin: ["위치", "장소"], bookmark: ["북마크", "저장", "읽는 중"],
};

/** Icons whose words match the typed name (best first). */
export function suggestIcons(name: string): string[] {
  const n = name.trim().toLowerCase().replace(/\s+/g, "");
  if (!n) return [];
  const scored: [string, number][] = [];
  for (const [k, words] of Object.entries(ICON_WORDS)) {
    if (!(k in ICONS)) continue;
    let best = 0;
    for (const w of words) {
      const x = w.toLowerCase().replace(/\s+/g, "");
      if (x === n) best = Math.max(best, 3);
      else if (n.includes(x) || x.includes(n)) best = Math.max(best, x.length >= 2 && n.length >= 2 ? 2 : 1);
    }
    if (best) scored.push([k, best]);
  }
  return scored.sort((a, b) => b[1] - a[1]).map(([k]) => k).slice(0, 8);
}

/** Order shown in the icon picker (every registered icon except the internal aliases). */
export const ICON_CHOICES = Object.keys(ICONS).filter((k) => k !== "wish");

/** Uploaded images are stored as "img:<data-url>" and rendered like an icon. */
const imgIcons = new Map<string, LucideIcon>();
function imageIcon(src: string): LucideIcon {
  let C = imgIcons.get(src);
  if (!C) {
    C = forwardRef<HTMLImageElement, { size?: number | string; className?: string }>(({ size = 16, className }, ref) =>
      createElement("img", { ref, src, alt: "", width: size, height: size, className: `${className ?? ""} rounded-[3px] object-cover`, style: { width: size, height: size } }),
    ) as unknown as LucideIcon;
    imgIcons.set(src, C);
  }
  return C;
}

export const iconOf = (key: string | undefined): LucideIcon =>
  key?.startsWith("img:") ? imageIcon(key.slice(4)) : (key && ICONS[key]) || Bookmark;

/** Read an image file into a small square data URL for use as an icon. */
export function imageToIcon(file: File, size = 64): Promise<string> {
  return new Promise((res, rej) => {
    const img = new window.Image();
    img.onload = () => {
      const c = Object.assign(document.createElement("canvas"), { width: size, height: size });
      const s = Math.min(img.width, img.height);
      c.getContext("2d")!.drawImage(img, (img.width - s) / 2, (img.height - s) / 2, s, s, 0, 0, size, size);
      res("img:" + c.toDataURL("image/png"));
    };
    img.onerror = () => rej(new Error("이미지를 읽을 수 없어요"));
    img.src = URL.createObjectURL(file);
  });
}
