import { create } from "zustand";
import { api } from "@/api";
import type { Archive, CardAspect, CardField, Item, Kind, Layout, TagCategory } from "@/api/types";
import { KINDS } from "@/api/types";
import { KIND_CONFIG } from "./kinds";
import { iconOf } from "./icons";
import { useApp } from "@/store/app";

/**
 * A format = an archive template: card shape, layout, which properties exist (with their labels),
 * and `base` = the built-in kind whose online sources are used for auto-fill.
 * Built-ins come from KIND_CONFIG (id = kind) and can be edited/hidden; users can add their own.
 * Stored in the library settings under "formats".
 */
export interface Format {
  id: string;
  name: string;
  icon: string;
  base: Kind;
  aspect: CardAspect;
  layout: Layout;
  tagCats: [TagCategory, string][];
  showUrl?: boolean;
  showCode?: boolean;
  custom?: boolean;
}

interface Stored { custom: Format[]; overrides: Record<string, Partial<Format>>; hidden: string[] }
const EMPTY: Stored = { custom: [], overrides: {}, hidden: [] };

const builtin = (k: Kind): Format => {
  const c = KIND_CONFIG[k];
  return { id: k, name: c.label, icon: k, base: k, aspect: c.aspect, layout: c.layout, tagCats: c.tagCats, showUrl: c.showUrl, showCode: c.showCode };
};

export const useFormats = create<{
  stored: Stored;
  load(): Promise<void>;
  all(includeHidden?: boolean): Format[];
  get(id: string | null | undefined): Format;
  isHidden(id: string): boolean;
  save(f: Format): Promise<void>;
  remove(id: string): Promise<void>;
  restore(id: string): Promise<void>;
}>((set, get) => {
  const persist = async (stored: Stored) => { set({ stored }); await api.setSettings("formats", stored); };
  return {
    stored: EMPTY,
    async load() { set({ stored: { ...EMPTY, ...((await api.getSettings<Stored>("formats")) ?? {}) } }); },
    all(includeHidden = false) {
      const { custom, overrides, hidden } = get().stored;
      const list = [...KINDS.map((k) => ({ ...builtin(k), ...overrides[k] })), ...custom];
      return includeHidden ? list : list.filter((f) => !hidden.includes(f.id));
    },
    get(id) {
      const { custom, overrides } = get().stored;
      const c = custom.find((f) => f.id === id);
      if (c) return c;
      const k = (KINDS as readonly string[]).includes(id ?? "") ? (id as Kind) : "other";
      return { ...builtin(k), ...overrides[k] };
    },
    isHidden: (id) => get().stored.hidden.includes(id),
    async save(f) {
      const s = get().stored;
      if (f.custom) await persist({ ...s, custom: s.custom.some((x) => x.id === f.id) ? s.custom.map((x) => (x.id === f.id ? f : x)) : [...s.custom, f] });
      else await persist({ ...s, overrides: { ...s.overrides, [f.id]: f } });
    },
    async remove(id) {
      const s = get().stored;
      // custom formats are deleted; built-ins are hidden from pickers (archives using them keep working)
      if (s.custom.some((f) => f.id === id)) await persist({ ...s, custom: s.custom.filter((f) => f.id !== id) });
      else await persist({ ...s, hidden: [...new Set([...s.hidden, id])] });
    },
    async restore(id) {
      const s = get().stored;
      const { [id]: _o, ...overrides } = s.overrides;
      await persist({ ...s, overrides, hidden: s.hidden.filter((h) => h !== id) });
    },
  };
});

/** Format of an archive (its custom format, else the built-in one of its kind). */
export const formatOfArchive = (a: Archive | undefined | null, fallback: Kind = "other") =>
  useFormats.getState().get(a?.format ?? a?.kind ?? fallback);

/** Format used to show an item: the format of its archive, else of its kind. */
export function formatOfItem(it: Pick<Item, "archiveId" | "kind">) {
  const a = useApp.getState().archives.find((x) => x.id === it.archiveId);
  return a ? formatOfArchive(a) : useFormats.getState().get(it.kind);
}

/** KindConfig-shaped view of a format (what the item panel / cards read). */
export function formatConfig(f: Format) {
  const base = KIND_CONFIG[f.base];
  return {
    ...base,
    label: f.name,
    icon: iconOf(f.icon),
    tagCats: f.tagCats,
    layout: f.layout,
    aspect: f.aspect,
    showUrl: f.showUrl,
    showCode: f.showCode,
    cardFields: base.cardFields as CardField[],
  };
}
