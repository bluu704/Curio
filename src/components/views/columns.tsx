import {
  CalendarClock, CalendarDays, CalendarPlus, CirclePlay, Files, Folder, Gift, Hash, Link2, Star, Type, type LucideIcon,
} from "lucide-react";
import type { ColumnKey, FieldDef, Item, TagCategory } from "@/api/types";
import { TAG_CATEGORIES } from "@/api/types";
import { TAG_META } from "@/lib/meta";
import { date, relative } from "@/lib/format";
import { useApp } from "@/store/app";
import { folderColor } from "@/lib/statuses";
import { Stars } from "@/components/ui/Stars";
import { FIELD_ICONS } from "@/components/settings/fieldIcons";
import { propLabels, propName, type PropKey } from "@/lib/properties";
import { StatusPicker, tagsOf } from "./shared";

export interface ColumnDef { key: ColumnKey; label: string; icon: LucideIcon; width: string; render: (it: Item) => React.ReactNode }

const LEGACY: Record<string, string> = { author: "tag:author", genre: "tag:genre", tag: "tag:tag" };
export const normalizeColumn = (k: ColumnKey) => LEGACY[k] ?? k;

const chips = (it: Item, cat: TagCategory) => (
  <div className="flex min-w-0 gap-1 overflow-hidden">
    {tagsOf(it, cat).map((t) => <span key={t.id} className="chip shrink-0">{t.name}</span>)}
  </div>
);

/** Every column the table can show (built-ins, each tag category, custom properties). */
export function allColumns(fields: FieldDef[], archiveId?: string | null): ColumnDef[] {
  const upd = useApp.getState().updateItem;
  const labels = propLabels(archiveId);
  const catLabel = (c: TagCategory) => labels.find(([x]) => x === c)?.[1] || TAG_META[c].label;
  const nameOf = (k: PropKey) => propName(k, archiveId);
  return [
    { key: "status", label: nameOf("status"), icon: CirclePlay, width: "120px", render: (it) => <StatusPicker item={it} /> },
    { key: "rating", label: "평점", icon: Star, width: "110px", render: (it) => <Stars value={it.rating} size={13} onChange={(rating) => void upd(it.id, { rating })} /> },
    ...TAG_CATEGORIES.map((c): ColumnDef => ({ key: `tag:${c}`, label: catLabel(c), icon: TAG_META[c].icon, width: "minmax(120px, 1fr)", render: (it) => chips(it, c) })),
    { key: "category", label: nameOf("category"), icon: Folder, width: "minmax(110px, 1fr)", render: (it) => {
      const cats = useApp.getState().categories;
      return <div className="flex min-w-0 gap-1 overflow-hidden">{it.categoryIds.map((id) => cats.find((c) => c.id === id)).filter(Boolean).map((c) => <span key={c!.id} className="chip shrink-0"><Folder size={11} style={{ color: folderColor(c!.color) }} />{c!.name}</span>)}</div>;
    } },
    { key: "year", label: nameOf("year"), icon: CalendarDays, width: "70px", render: (it) => <span className="tabular-nums text-muted">{it.year ?? ""}</span> },
    { key: "code", label: nameOf("code"), icon: Hash, width: "110px", render: (it) => <span className="font-mono text-[length:calc(12px*var(--ts))] text-muted">{it.code ?? ""}</span> },
    { key: "url", label: nameOf("url"), icon: Link2, width: "minmax(120px, 1fr)", render: (it) => it.url ? <a href={it.url} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()} className="truncate text-accent underline-offset-2 hover:underline">{it.url.replace(/^https?:\/\/(www\.)?/, "")}</a> : null },
    { key: "list", label: "목록", icon: Gift, width: "90px", render: (it) => <span className="whitespace-nowrap text-muted">{it.list === "wishlist" ? "위시리스트" : "아카이브"}</span> },
    { key: "files", label: "파일", icon: Files, width: "70px", render: (it) => it.files.length ? <span className="inline-flex items-center gap-1 text-muted"><Files size={13} />{it.files.length}</span> : null },
    ...fields.map((f): ColumnDef => ({ key: `field:${f.id}`, label: f.name, icon: FIELD_ICONS[f.type], width: "minmax(100px, 1fr)", render: (it) => {
      const v = it.props[f.id];
      return <span className="truncate text-fg/80">{Array.isArray(v) ? v.join(", ") : typeof v === "boolean" ? (v ? "✓" : "") : v == null ? "" : String(v)}</span>;
    } })),
    { key: "createdAt", label: nameOf("added"), icon: CalendarPlus, width: "100px", render: (it) => <span className="tabular-nums text-muted">{date(it.createdAt)}</span> },
    { key: "updatedAt", label: "수정", icon: CalendarClock, width: "100px", render: (it) => <span className="text-muted">{relative(it.updatedAt)}</span> },
  ];
}

export const TITLE_COL = { key: "title", label: "제목", icon: Type, width: "minmax(240px, 2fr)" };
