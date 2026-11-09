import { create } from "zustand";
import { api } from "@/api";
import type { FieldDef, Item, TagCategory } from "@/api/types";
import { useApp } from "@/store/app";
import { isMusicName } from "@/lib/itemFlags";
import { TAG_META } from "@/lib/meta";

/**
 * Properties shown on items: built-in ones bound to data the app fills automatically
 * (tags of a category, link, year…) plus the user's own fields. Kept in the library settings
 * ("properties") so every device shows the same list.
 */
export type Binding = "status" | "category" | "url" | "year" | "code" | "added" | `tag:${TagCategory}`;
export type PropKey = Binding | `field:${string}`;
export interface PropDef { key: PropKey; name: string; icon: string }

/** Shown on a new library. */
export const DEFAULT_PROPS: PropDef[] = [
  { key: "status", name: "상태", icon: "check" },
  { key: "category", name: "폴더", icon: "folder" },
  { key: "tag:author", name: "작가", icon: "user" },
  { key: "tag:series", name: "시리즈", icon: "layers" },
  { key: "tag:genre", name: "장르", icon: "shapes" },
  { key: "tag:tag", name: "태그", icon: "hash" },
  { key: "url", name: "링크", icon: "link" },
  { key: "year", name: "연도", icon: "calendar" },
  { key: "added", name: "추가일", icon: "calendarplus" },
];

const BINDING_ICON: Record<Binding, string> = {
  status: "check", category: "folder", url: "link", year: "calendar", code: "barcode", added: "calendarplus",
  "tag:author": "user", "tag:director": "film", "tag:studio": "building", "tag:publisher": "megaphone", "tag:cast": "mic",
  "tag:circle": "users", "tag:series": "layers", "tag:genre": "shapes", "tag:tag": "hash",
};

/** Names that mean a built-in binding (so auto-fill keeps working when the property is re-created). */
const ALIASES: Record<Binding, string[]> = {
  status: ["상태", "감상 상태", "진행 상태", "진행", "status"],
  category: ["폴더", "분류", "folder"],
  url: ["링크", "주소", "url", "사이트", "출처", "원본", "원본 링크", "웹사이트", "link"],
  year: ["연도", "년도", "출시", "출시년도", "출시 연도", "발매", "발매년도", "발매 연도", "방영", "방영년도", "개봉", "개봉년도", "연재 시작", "year", "release"],
  code: ["품번", "코드", "제품 코드", "작품 번호", "code"],
  added: ["추가일", "등록일", "추가한 날", "added"],
  "tag:author": ["작가", "저자", "글", "그림", "글작가", "그림작가", "원작", "원작자", "일러스트", "일러스트레이터", "아티스트", "가수", "뮤지션", "작곡가", "작사가", "만화가", "소설가", "크리에이터", "채널", "유튜버", "author", "artist", "writer", "creator"],
  "tag:director": ["감독", "연출", "디렉터", "director"],
  "tag:studio": ["스튜디오", "제작사", "개발사", "제작", "개발", "애니메이션 제작", "studio", "developer"],
  "tag:publisher": ["출판사", "배급사", "배급", "배급·레이블", "퍼블리셔", "유통사", "레이블", "방송사", "연재처", "publisher", "label"],
  "tag:cast": ["출연", "출연진", "배우", "성우", "캐스트", "출연·성우", "cast", "actor"],
  "tag:circle": ["서클", "동인 서클", "circle"],
  "tag:series": ["시리즈", "앨범", "프랜차이즈", "세계관", "series", "album"],
  "tag:genre": ["장르", "분야", "genre"],
  "tag:tag": ["태그", "키워드", "tag", "tags"],
};
const norm = (s: string) => s.toLowerCase().replace(/[\s·_\-./]/g, "");

/**
 * Facts a source may bring besides the built-ins (Candidate.extra), and the property names that ask
 * for them. A user's own property with one of these names is filled automatically.
 */
const EXTRA_ALIASES: Record<string, string[]> = {
  album: ["앨범", "수록 앨범", "수록앨범", "음반", "album"],
  duration: ["재생시간", "재생 시간", "길이", "곡 길이", "러닝타임", "러닝 타임", "상영시간", "상영 시간", "플레이타임", "플레이 타임", "분량", "시간", "회당 시간", "runtime", "duration", "length", "playtime"],
  episodes: ["화수", "총 화수", "총화수", "에피소드", "에피소드 수", "회차", "편수", "episodes"],
  chapters: ["챕터", "챕터 수", "연재 화수", "chapters"],
  volumes: ["권수", "권", "단행본", "단행본 수", "volumes"],
  pages: ["페이지", "페이지 수", "쪽수", "쪽", "pages"],
  publisher: ["출판사", "퍼블리셔", "레이블", "발행처", "발행사", "publisher", "label"],
  developer: ["개발사", "개발", "developer"],
  studio: ["제작사", "스튜디오", "애니메이션 제작", "studio"],
  language: ["언어", "language"],
  network: ["방송사", "방송", "채널", "방영 채널", "network"],
  platform: ["플랫폼", "기종", "지원 기종", "platform"],
  isbn: ["isbn"],
  format: ["형식", "포맷", "타입", "유형", "분류", "format", "type"],
  release: ["발매일", "출시일", "개봉일", "방영일", "공개일", "발행일", "출간일", "release date", "released"],
  season: ["시즌", "방영 시기", "분기", "season"],
  source: ["원작 형식", "원작 종류", "원작 매체", "원작 분류", "source"],
  airing: ["방영 상태", "연재 상태", "완결 여부", "진행 상황", "연재", "방영"],
  country: ["국가", "나라", "제작 국가", "country"],
  price: ["가격", "price"],
  characters: ["캐릭터", "등장인물", "characters"],
};
/** The fact a property name asks for (album, duration…), if any. */
export function extraFor(name: string): string | null {
  const n = norm(name);
  for (const [k, names] of Object.entries(EXTRA_ALIASES)) if (names.some((x) => norm(x) === n)) return k;
  return null;
}

/**
 * props patch that fills the item's empty user properties from the facts saved with it (props._extra),
 * or null when there is nothing to fill.
 */
export function extraPatch(it: Item): Record<string, unknown> | null {
  const extra = it.props?._extra as Record<string, string> | undefined;
  if (!extra) return null;
  const fields = useApp.getState().fields;
  const props = { ...it.props };
  let changed = false;
  for (const p of useProps.getState().list) {
    if (!p.key.startsWith("field:")) continue;
    const f = fields.find((x) => `field:${x.id}` === p.key);
    const k = extraFor(p.name) ?? (f ? extraFor(f.name) : null);
    const raw = k ? extra[k] : undefined;
    if (!f || !raw || (props[f.id] !== undefined && props[f.id] !== "" && props[f.id] !== null)) continue;
    let v: unknown = raw;
    if (f.type === "number") { const m = /\d+(\.\d+)?/.exec(raw); if (!m) continue; v = Number(m[0]); }
    else if (f.type === "multi_select") v = raw.split(/\s*,\s*/).filter(Boolean);
    else if (f.type === "select") { if (!f.options.includes(raw)) continue; }
    else if (f.type === "date") { if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) continue; }
    else if (f.type === "checkbox") continue;
    props[f.id] = v;
    changed = true;
  }
  return changed ? props : null;
}

/** The built-in a property name stands for, if any. */
export function bindingFor(name: string): Binding | null {
  const n = norm(name);
  for (const [b, names] of Object.entries(ALIASES) as [Binding, string[]][]) if (names.some((x) => norm(x) === n)) return b;
  return null;
}
export const iconForBinding = (b: Binding) => BINDING_ICON[b];
/** What a song archive calls a property while the library-wide name is still the default one. */
const SONG_NAMES: Partial<Record<PropKey, [string, string]>> = { "tag:author": ["작가", "아티스트"], "tag:series": ["시리즈", "앨범"] };

/**
 * A property's name as shown in an archive: the archive's own name for it (renamed in 속성 편집),
 * else — in a song archive — 아티스트 / 앨범 for the default 작가 / 시리즈, else the library-wide name.
 */
export function propName(key: PropKey, archiveId?: string | null, ignoreOwn = false): string {
  const s = useApp.getState();
  const own = ignoreOwn ? undefined : s.views.find((v) => v.id === (archiveId ? `arc:${archiveId}` : "sys:all"))?.card.props?.names?.[key];
  if (own) return own;
  const global = useProps.getState().list.find((p) => p.key === key)?.name
    ?? DEFAULT_PROPS.find((p) => p.key === key)?.name
    ?? (isTagKey(key) ? TAG_META[key.slice(4) as TagCategory].label : key);
  const song = SONG_NAMES[key];
  const arc = archiveId ? s.archives.find((a) => a.id === archiveId) : undefined;
  if (song && global === song[0] && arc && (arc.kind === "music" || isMusicName(arc.name))) return song[1];
  return global;
}

/** Tag properties' current names (for table columns), as the given archive shows them. */
export const propLabels = (archiveId?: string | null): [TagCategory, string][] =>
  useProps.getState().list.filter((p) => p.key.startsWith("tag:")).map((p) => [p.key.slice(4) as TagCategory, propName(p.key, archiveId)]);
export const isTagKey = (k: PropKey): k is `tag:${TagCategory}` => k.startsWith("tag:");

/** Fill a newly made property on every item that has a saved fact for it. */
async function backfill() {
  const items = (await api.listItems({}).catch(() => [])).filter((it) => it.props?._extra);
  for (const it of items) {
    const props = extraPatch(it);
    if (props) await api.updateItem(it.id, { props }).catch(() => undefined);
  }
  if (items.length) await useApp.getState().refresh();
}

interface Stored { list: PropDef[] }

export const useProps = create<{
  list: PropDef[];
  load(): Promise<void>;
  save(list: PropDef[]): Promise<void>;
  update(key: PropKey, patch: Partial<PropDef>): Promise<void>;
  remove(key: PropKey): Promise<void>;
  /** New property: a known name brings back its built-in (and the data already filled); otherwise a new field. */
  add(name: string, type: FieldDef["type"], icon?: string): Promise<PropDef | null>;
}>((set, get) => ({
  list: DEFAULT_PROPS,
  async load() {
    const s = await api.getSettings<Stored>("properties").catch(() => null);
    const fields = useApp.getState().fields;
    if (s?.list) { set({ list: s.list }); return; }
    // first run: defaults + the fields made before properties were editable
    set({ list: [...DEFAULT_PROPS, ...fields.map((f): PropDef => ({ key: `field:${f.id}`, name: f.name, icon: "tag" }))] });
  },
  async save(list) { set({ list }); await api.setSettings("properties", { list }); },
  async update(key, patch) {
    const list = get().list.map((p) => (p.key === key ? { ...p, ...patch } : p));
    await get().save(list);
    if (key.startsWith("field:") && patch.name) {
      const f = useApp.getState().fields.find((x) => `field:${x.id}` === key);
      if (f) await useApp.getState().saveField({ ...f, name: patch.name });
      if (extraFor(patch.name)) void backfill();
    }
  },
  async remove(key) {
    await get().save(get().list.filter((p) => p.key !== key));
    // a user field and its values go; built-in data (tags, link, year) stays for when it comes back
    if (key.startsWith("field:")) await useApp.getState().deleteField(key.slice(6));
  },
  async add(name, type, icon) {
    const n = name.trim();
    if (!n) return null;
    const b = bindingFor(n);
    if (b && !get().list.some((p) => p.key === b)) {
      const p: PropDef = { key: b, name: n, icon: icon ?? BINDING_ICON[b] };
      await get().save([...get().list, p]);
      return p;
    }
    const id = (crypto as Crypto & { randomUUID?: () => string }).randomUUID?.() ?? Math.random().toString(36).slice(2);
    await useApp.getState().saveField({ id, name: n, type, options: [], position: useApp.getState().fields.length });
    const p: PropDef = { key: `field:${id}`, name: n, icon: icon ?? "tag" };
    await get().save([...get().list, p]);
    if (extraFor(n)) void backfill(); // e.g. "앨범": filled on every item whose source told it
    return p;
  },
}));
