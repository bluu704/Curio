import { create } from "zustand";
import { api } from "@/api";
import type { FieldDef, TagCategory } from "@/api/types";
import { useApp } from "@/store/app";

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

/** The built-in a property name stands for, if any. */
export function bindingFor(name: string): Binding | null {
  const n = norm(name);
  for (const [b, names] of Object.entries(ALIASES) as [Binding, string[]][]) if (names.some((x) => norm(x) === n)) return b;
  return null;
}
export const iconForBinding = (b: Binding) => BINDING_ICON[b];
/** Tag properties' current names (for table columns). */
export const propLabels = (): [TagCategory, string][] =>
  useProps.getState().list.filter((p) => p.key.startsWith("tag:")).map((p) => [p.key.slice(4) as TagCategory, p.name]);
export const isTagKey = (k: PropKey): k is `tag:${TagCategory}` => k.startsWith("tag:");

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
    return p;
  },
}));
