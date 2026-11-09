import { Eye, EyeOff, ListPlus, Pencil, Trash2, type LucideIcon } from "lucide-react";
import { Select } from "@/components/ui/Select";
import { useState } from "react";
import type { FieldType, Item, TagCategory } from "@/api/types";
import { useApp } from "@/store/app";
import { useNarrow } from "@/hooks/useNarrow";
import { STATUS_META } from "@/lib/meta";
import { date } from "@/lib/format";
import { cn } from "@/lib/cn";
import { iconOf, suggestIcons } from "@/lib/icons";
import { bindingFor, iconForBinding, isTagKey, propName, useProps, type PropDef, type PropKey } from "@/lib/properties";
import { Popover } from "@/components/ui/Popover";
import { MenuItem } from "@/components/ui/Menu";
import { IconGrid } from "@/components/ui/IconGrid";
import { FIELD_LABELS } from "@/components/settings/fieldIcons";
import { TagInput } from "./TagInput";
import { FieldInput } from "./FieldInput";
import { CategoryPicker } from "./CategoryPicker";

/** `wide` rows (long text) take the full width; the rest sit two per line. */
interface Row { key: PropKey; icon: LucideIcon; label: string; node: React.ReactNode; wide?: boolean }

/**
 * The item's properties: the library's property list (built-ins + the user's own), with each
 * archive able to hide some of them in 속성 편집 mode.
 */
export function PropertyList({ item, editing, onDone }: { item: Item; editing: boolean; onDone: () => void }) {
  const s = useApp();
  const { updateItem, fields } = s;
  const props = useProps((p) => p.list);
  const removeProp = useProps((p) => p.remove);
  const viewId = item.archiveId ? `arc:${item.archiveId}` : "sys:all";
  const layout = s.views.find((v) => v.id === viewId)?.card.props ?? {};
  const hidden = layout.hidden ?? [];
  const SM = STATUS_META[item.status];

  const nodeOf = (p: PropDef): Row | null => {
    const base = { key: p.key, icon: iconOf(p.icon), label: propName(p.key, item.archiveId) };
    if (p.key === "status") return { ...base, node: (
      <Popover width={170} trigger={({ toggle }) => (
        <button className={cn("inline-flex h-6 items-center gap-1 whitespace-nowrap rounded-md px-1.5 text-[length:calc(12px*var(--ts))] font-medium tone-bg", SM.tone)} onClick={toggle}><SM.icon size={13} />{SM.label}</button>
      )}>
        {(close) => s.statuses.map((d) => {
          const M = STATUS_META[d.id];
          return (
            <MenuItem key={d.id} checked={item.status === d.id} onClick={() => { void updateItem(item.id, { status: d.id }); close(); }}>
              <span className={cn("inline-flex items-center gap-2", M.tone)}><M.icon size={14} className="tone-text" />{M.label}</span>
            </MenuItem>
          );
        })}
      </Popover>
    ) };
    if (p.key === "category") return { ...base, node: <CategoryPicker item={item} /> };
    if (isTagKey(p.key)) {
      const c = p.key.slice(4) as TagCategory;
      return { ...base, node: <TagInput item={item} category={c} label={base.label} />, wide: item.tags.filter((t) => t.category === c).length > 2 };
    }
    if (p.key === "url") return { ...base, node: <UrlProp value={item.url} onSave={(url) => void s.setLink(item.id, url)} /> };
    if (p.key === "code") return { ...base, node: <TextProp value={item.code} mono placeholder="ABC-123" onSave={(code) => void updateItem(item.id, { code })} /> };
    if (p.key === "year") return { ...base, node: <TextProp value={item.year?.toString() ?? null} placeholder="2024" onSave={(v) => void updateItem(item.id, { year: v && /^\d{4}$/.test(v) ? Number(v) : null })} /> };
    if (p.key === "added") return { ...base, node: <span className="flex h-8 items-center px-1.5 text-muted">{date(item.createdAt)}</span> };
    const f = fields.find((x) => `field:${x.id}` === p.key);
    if (!f) return null;
    return { ...base, node: <FieldInput item={item} field={f} />, wide: ["text", "multi_select"].includes(f.type) };
  };
  const rows = props.map(nodeOf).filter((r): r is Row => !!r);

  /** 속성 편집: a name typed here is this archive's own name for the property ("" = back to the usual one). */
  const rename = (key: PropKey, v: string) => {
    const names = { ...(layout.names ?? {}) };
    delete names[key];
    const usual = propName(key, item.archiveId, true);
    if (v.trim() && v.trim() !== usual) names[key] = v.trim();
    s.setPropLayout(item.archiveId, { names });
  };
  const toggle = (key: string) =>
    s.setPropLayout(item.archiveId, { hidden: hidden.includes(key) ? hidden.filter((k) => k !== key) : [...hidden, key] });
  const visible = editing ? rows : rows.filter((r) => !hidden.includes(r.key));
  const stack = useNarrow();
  // two per line: a short row left alone before a wide one stretches instead of leaving a hole
  const spans = visible.map((r) => !!r.wide);
  for (let i = 0, col = 0; i < visible.length; i++) {
    if (spans[i]) { col = 0; continue; }
    const nextWide = i + 1 >= visible.length || spans[i + 1];
    if (col === 0 && nextWide) spans[i] = true; else col = (col + 1) % 2;
  }

  return (
    <div className="mt-5">
      {editing && (
        <div className="mb-2 flex items-center gap-2 rounded-lg bg-accent/10 px-3 py-2 text-[length:calc(12px*var(--ts))] text-accent">
          <span className="flex-1">{s.archives.find((a) => a.id === item.archiveId)?.name ?? "이 아카이브"}에서 보이기</span>
          <button className="btn btn-primary h-7" onClick={onDone}>완료</button>
        </div>
      )}
      <div className="grid grid-cols-2 gap-x-3 gap-y-0.5">
        {visible.map((r, i) => {
          const off = hidden.includes(r.key);
          return (
            <div key={r.key} className={cn("group/prop flex min-h-8 min-w-0 gap-2", spans[i] && "col-span-2", editing && off && "opacity-40",
              // phones: name above the value so the value gets the whole half-width cell
              stack && !spans[i] ? "flex-col gap-0 pb-1" : "items-start")}>
              <div className={cn("flex shrink-0 items-center gap-2 text-[length:calc(12px*var(--ts))] text-muted", stack && !spans[i] ? "h-6" : "h-8 w-[84px]")}>
                {editing ? (
                  <button className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md hover:bg-subtle hover:text-fg" onClick={() => toggle(r.key)} data-tip={off ? "보이기" : "숨기기"}>
                    {off ? <EyeOff size={14} /> : <Eye size={14} />}
                  </button>
                ) : (
                  <r.icon size={14} className="shrink-0" />
                )}
                {editing ? (
                  <input key={r.label} defaultValue={r.label} onBlur={(e) => e.target.value !== r.label && rename(r.key, e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }} data-tip="이 아카이브에서 부를 이름"
                    className="h-6 min-w-0 flex-1 rounded-md bg-transparent px-1 text-fg outline-none hover:bg-subtle focus:bg-subtle" />
                ) : (
                  <span className="truncate whitespace-nowrap">{r.label}</span>
                )}
              </div>
              <div className={cn("min-w-0 flex-1", editing && "pointer-events-none")}>{r.node}</div>
              {editing && <DeleteProp name={r.label} onDelete={() => void removeProp(r.key)} />}
            </div>
          );
        })}
      </div>
      {editing && (
        <Popover width={260} trigger={({ toggle: t }) => (
          <button className="btn mt-2 w-full justify-center border border-dashed border-line text-muted" onClick={t}><ListPlus size={15} />속성 추가</button>
        )}>
          {(close) => <NewProp onDone={close} />}
        </Popover>
      )}
    </div>
  );
}

/** Link value: the site name, opening the page; the pencil edits the address. */
function UrlProp({ value, onSave }: { value: string | null; onSave: (v: string | null) => void }) {
  const [edit, setEdit] = useState(false);
  if (!value || edit) {
    return (
      <div onBlur={() => setEdit(false)}>
        <TextProp value={value} placeholder="https://" onSave={(v) => { setEdit(false); onSave(v); }} autoFocus={edit} />
      </div>
    );
  }
  let host = value;
  try { host = new URL(value).hostname.replace(/^www\./, ""); } catch { /* keep the text */ }
  return (
    <div className="group/url flex h-8 min-w-0 items-center">
      <a href={value} target="_blank" rel="noreferrer" className="min-w-0 truncate rounded-md px-1.5 text-accent hover:underline" data-tip={value}>{host}</a>
      <button className="btn-icon h-7 w-7 shrink-0 opacity-0 group-hover/url:opacity-100" onClick={() => setEdit(true)} data-tip="주소 바꾸기"><Pencil size={12} /></button>
    </div>
  );
}

/** "속성 추가": name, kind of value and icon (suggested from the name). */
function NewProp({ onDone }: { onDone: () => void }) {
  const add = useProps((p) => p.add);
  const [name, setName] = useState("");
  const [type, setType] = useState<FieldType>("text");
  const [icon, setIcon] = useState<string | null>(null);
  const known = bindingFor(name);
  const suggested = suggestIcons(name);
  const shown = icon ?? (known ? iconForBinding(known) : suggested[0] ?? "tag");
  const go = async () => { if (await add(name, type, shown)) onDone(); };
  return (
    <div className="space-y-2 p-2">
      <input autoFocus className="input h-8" placeholder="속성 이름" value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && void go()} />
      {!known && (
        <Select className="h-8" value={type} onChange={setType} options={(Object.keys(FIELD_LABELS) as FieldType[]).map((t) => ({ value: t, label: FIELD_LABELS[t] }))} />
      )}
      <IconGrid value={shown} onChange={setIcon} cols={8} suggested={suggested} compact />
      <button className="btn btn-primary h-8 w-full justify-center" disabled={!name.trim()} onClick={() => void go()}>추가</button>
    </div>
  );
}

function DeleteProp({ name, onDelete }: { name: string; onDelete: () => void }) {
  const [sure, setSure] = useState(false);
  return sure ? (
    <button className="btn h-8 shrink-0 bg-danger/10 px-2 text-[length:calc(12px*var(--ts))] text-danger" onClick={onDelete} onMouseLeave={() => setSure(false)}>삭제</button>
  ) : (
    <button className="btn-icon h-8 w-8 shrink-0 hover:text-danger" data-tip={`"${name}" 삭제`} onClick={() => setSure(true)}><Trash2 size={13} /></button>
  );
}

export function TextProp({ value, onSave, placeholder, mono, autoFocus }: { value: string | null; onSave: (v: string | null) => void; placeholder?: string; mono?: boolean; autoFocus?: boolean }) {
  return (
    <input
      autoFocus={autoFocus}
      key={value ?? ""}
      defaultValue={value ?? ""}
      placeholder={placeholder}
      className={cn("h-8 w-full min-w-0 rounded-md bg-transparent px-1.5 outline-none placeholder:text-muted/50 hover:bg-subtle focus:bg-subtle", mono && "font-mono")}
      onBlur={(e) => { const v = e.target.value.trim() || null; if (v !== value) onSave(v); }}
      onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
    />
  );
}
