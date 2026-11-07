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
  // status icons (also usable anywhere)
  play: CirclePlay, check: CircleCheck, pause: CirclePause, x: CircleX, clock: Clock, hourglass: Hourglass, eye: Eye, repeat: Repeat,
};

/** Order shown in the icon picker (every registered icon except the internal aliases). */
export const ICON_CHOICES = Object.keys(ICONS).filter((k) => !["hash", "wish"].includes(k));

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
