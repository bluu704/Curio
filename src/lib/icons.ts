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
  Album, AudioLines, ListMusic, Podcast, MonitorPlay, Projector, Ticket, Speaker, Drum, BookA, BookCopy, BookText, Notebook, StickyNote,
  FileText, Archive as ArchiveBox, Inbox, Boxes, ShoppingBag, ShoppingCart, Store, Receipt, Wallet, CreditCard, PartyPopper, Candy,
  Beer, CupSoda, Croissant, ChefHat, Soup, Salad, Carrot, Shell, Turtle, Squirrel, Snail, Bone, Footprints, Dumbbell, Volleyball,
  Goal, Target, Crosshair, Spade, Club, Cpu, Laptop, Monitor, Keyboard, Tablet, Headset, Bot, Code, Terminal, Database, Telescope,
  Microscope, FlaskConical, Dna, Brain, HeartPulse, Stethoscope, Pill, GraduationCap, PenTool, Highlighter, Scissors, Compass, Map as MapIcon,
  Earth, Train, Bus, Ship, House, Hotel, Church, Landmark, Factory, TreePalm, Waves, Sunset, CloudRain, Wind, Trees, Sparkle,
  Droplet, AlarmClock, CalendarClock, History, AtSign, Quote, MessageCircle, Mail, Send, ThumbsUp, Smile, Laugh, Frown, IdCard,
  Fingerprint, Lock, Aperture, Volume2, Handshake, HandHeart, Egg, Signature, BadgeCheck, Infinity as InfinityIcon,
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
  // more
  album: Album, audio: AudioLines, playlist: ListMusic, podcast: Podcast, stream: MonitorPlay, projector: Projector, ticket: Ticket,
  speaker: Speaker, drum: Drum, dictionary: BookA, books: BookCopy, booktext: BookText, notebook: Notebook, memo: StickyNote,
  document: FileText, archivebox: ArchiveBox, inbox: Inbox, boxes: Boxes, bag: ShoppingBag, cart: ShoppingCart, store: Store,
  receipt: Receipt, wallet: Wallet, card: CreditCard, party: PartyPopper, candy: Candy, beer: Beer, soda: CupSoda, croissant: Croissant,
  chef: ChefHat, soup: Soup, salad: Salad, carrot: Carrot, shell: Shell, turtle: Turtle, squirrel: Squirrel, snail: Snail, bone: Bone,
  footprints: Footprints, dumbbell: Dumbbell, ball: Volleyball, goal: Goal, target: Target, crosshair: Crosshair, spade: Spade,
  club: Club, cpu: Cpu, laptop: Laptop, monitor: Monitor, keyboard: Keyboard, tablet: Tablet, headset: Headset, bot: Bot, code: Code,
  terminal: Terminal, database: Database, telescope: Telescope, microscope: Microscope, flask: FlaskConical, dna: Dna, brain: Brain,
  pulse: HeartPulse, stethoscope: Stethoscope, pill: Pill, graduation: GraduationCap, pentool: PenTool, highlighter: Highlighter,
  scissors: Scissors, compass: Compass, map: MapIcon, earth: Earth, train: Train, bus: Bus, ship: Ship, house: House, hotel: Hotel,
  church: Church, landmark: Landmark, factory: Factory, palm: TreePalm, waves: Waves, sunset: Sunset, rain: CloudRain, wind: Wind,
  trees: Trees, sparkle: Sparkle, droplet: Droplet, alarm: AlarmClock, calendarclock: CalendarClock, history: History, at: AtSign,
  quote: Quote, chat: MessageCircle, mail: Mail, send: Send, thumbsup: ThumbsUp, smile: Smile, laugh: Laugh, frown: Frown, idcard: IdCard,
  fingerprint: Fingerprint, lock: Lock, aperture: Aperture, volume: Volume2, handshake: Handshake, handheart: HandHeart, egg: Egg,
  signature: Signature, verified: BadgeCheck, infinity: InfinityIcon,
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
  user: ["작가", "사람", "인물", "아티스트", "저자", "가수", "만든이", "창작자", "크리에이터", "감독", "author", "artist", "creator"], users: ["멤버", "그룹", "서클", "출연", "인물들", "출연진", "캐스트", "성우", "배우", "등장인물"], building: ["회사", "스튜디오", "제작사", "개발사", "출판사", "소속사", "레이블", "기획사", "studio", "developer", "publisher"],
  megaphone: ["배급", "홍보", "레이블", "출판"], layers: ["시리즈", "묶음", "series"], shapes: ["장르", "분류", "genre"], hash: ["태그", "번호", "tag"], label: ["태그", "라벨"],
  link: ["링크", "주소", "url", "사이트"], globe: ["웹", "사이트", "국가", "언어", "해외"], languages: ["언어", "번역", "자막", "더빙", "language"], calendar: ["연도", "날짜", "출시", "발매", "일정"],
  calendarplus: ["추가일", "등록", "등록일"], timer: ["시간", "러닝타임", "플레이타임", "분", "재생시간", "재생 시간", "길이", "상영시간", "분량", "duration"], list: ["화수", "회차", "에피소드", "권수", "순서", "번호", "챕터", "트랙", "목록", "episodes"], barcode: ["품번", "isbn", "바코드", "코드"],
  coins: ["가격", "금액", "구매가", "돈", "원"], ruler: ["크기", "사이즈", "길이", "페이지", "쪽수", "해상도", "치수"], folder: ["폴더", "위치", "보관"], check: ["상태", "완료"], eye: ["감상", "봄", "시청"],
  clock: ["시간", "기간"], pin: ["위치", "장소"], bookmark: ["북마크", "저장", "읽는 중"],
  // more words
  album: ["앨범", "음반", "수록", "album", "ep", "싱글"], audio: ["음원", "사운드", "효과음", "asmr", "오디오", "audio"],
  playlist: ["플레이리스트", "플리", "재생목록", "playlist", "셋리스트"], podcast: ["팟캐스트", "라디오", "podcast"],
  stream: ["스트리밍", "방송", "생방송", "방송사", "채널", "ott", "넷플릭스", "치지직", "트위치", "stream", "network"],
  projector: ["상영", "극장", "시사회"], ticket: ["티켓", "공연", "콘서트", "예매", "관람"], speaker: ["스피커", "음향"], drum: ["드럼", "밴드", "리듬"],
  dictionary: ["사전", "단어", "어학"], books: ["시리즈", "전집", "권수", "단행본"], booktext: ["소설", "원작", "줄거리", "스토리"],
  notebook: ["노트", "일기", "다이어리", "필기"], memo: ["메모", "비고", "참고", "note"], document: ["문서", "pdf", "파일", "논문"],
  archivebox: ["보관", "아카이브", "창고", "archive"], inbox: ["받은", "수집", "인박스"], boxes: ["수집품", "컬렉션", "굿즈", "피규어", "collection"],
  bag: ["쇼핑", "구매", "산 것", "구입"], cart: ["장바구니", "구매 예정", "살 것", "쇼핑"], store: ["가게", "상점", "판매처", "구매처", "스토어", "샵"],
  receipt: ["영수증", "구매 내역", "결제", "주문"], wallet: ["지갑", "가계부", "지출", "비용"], card: ["카드", "결제", "구독"],
  party: ["이벤트", "기념일", "파티", "축하"], candy: ["간식", "사탕"], beer: ["술", "맥주", "주류"], soda: ["음료", "콜라"],
  croissant: ["빵", "베이커리"], chef: ["요리", "레시피", "셰프"], soup: ["국", "찌개", "요리"], salad: ["샐러드", "다이어트"], carrot: ["채소", "식재료"],
  shell: ["바다", "조개"], turtle: ["거북", "느림"], squirrel: ["다람쥐"], snail: ["달팽이", "느림"], bone: ["뼈", "공포"],
  footprints: ["산책", "발자국", "걷기", "기록"], dumbbell: ["운동", "헬스", "피트니스", "gym"], ball: ["스포츠", "배구", "축구", "야구", "공"],
  goal: ["목표", "골"], target: ["목표", "달성", "목적"], crosshair: ["fps", "슈팅", "총"], spade: ["카드게임", "포커", "트럼프"], club: ["카드게임"],
  cpu: ["하드웨어", "컴퓨터", "pc", "사양"], laptop: ["노트북", "컴퓨터", "pc"], monitor: ["모니터", "pc", "데스크톱", "windows"],
  keyboard: ["키보드", "타자"], tablet: ["태블릿", "아이패드"], headset: ["헤드셋", "보이스챗"], bot: ["ai", "로봇", "봇"],
  code: ["코드", "개발", "프로그래밍", "code"], terminal: ["터미널", "개발"], database: ["데이터", "db", "기록"], telescope: ["천문", "별"],
  microscope: ["과학", "연구"], flask: ["실험", "화학", "과학"], dna: ["생물", "유전"], brain: ["지식", "공부", "심리", "두뇌"],
  pulse: ["건강", "운동"], stethoscope: ["병원", "의학"], pill: ["약", "건강"], graduation: ["공부", "학교", "강의", "졸업", "학습"],
  pentool: ["디자인", "작화"], highlighter: ["밑줄", "형광펜", "인용"], scissors: ["스크랩", "편집", "자르기"], compass: ["탐험", "모험", "방향"],
  map: ["지도", "여행", "지역"], earth: ["세계", "국가", "나라", "해외", "지역", "country"], train: ["기차", "여행"], bus: ["버스"], ship: ["배", "항해"],
  house: ["집", "가정", "인테리어"], hotel: ["호텔", "숙소"], church: ["교회"], landmark: ["관광", "명소", "박물관"], factory: ["공장", "제조사", "메이커"],
  palm: ["휴가", "여름"], waves: ["바다", "물결"], sunset: ["노을", "저녁"], rain: ["비", "날씨"], wind: ["바람"], trees: ["숲", "자연"],
  sparkle: ["반짝", "추천"], droplet: ["물", "향수"], alarm: ["알람", "마감"], calendarclock: ["예정일", "마감일", "출시 예정", "일정"],
  history: ["기록", "히스토리", "이력", "최근"], at: ["계정", "아이디", "sns", "트위터"], quote: ["명대사", "인용", "대사", "문구"],
  chat: ["대화", "리뷰", "댓글", "후기", "코멘트"], mail: ["메일", "편지"], send: ["보내기", "공유"], thumbsup: ["추천", "좋아요", "평가"],
  smile: ["기분", "웃음", "코미디", "개그"], laugh: ["코미디", "개그", "웃긴"], frown: ["슬픔", "새드", "비극"], idcard: ["프로필", "캐릭터", "인물 정보"],
  fingerprint: ["추리", "미스터리", "범죄"], lock: ["비공개", "잠금", "성인", "19금"], aperture: ["사진", "렌즈", "카메라"], volume: ["소리", "볼륨"],
  handshake: ["협업", "콜라보", "제휴"], handheart: ["후원", "기부", "선물"], egg: ["부활절", "이스터에그"], signature: ["사인", "서명", "친필"],
  verified: ["인증", "공식", "정품"], infinity: ["무한", "반복", "영원"],
  // property names (built-in and common custom ones)
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
