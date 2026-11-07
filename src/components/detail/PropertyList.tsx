import { CalendarDays, CalendarPlus, ExternalLink, Eye, EyeOff, Folder, Hash, Link2, ListPlus, Trash2, type LucideIcon } from "lucide-react";
import { useState } from "react";
import { KINDS, TAG_CATEGORIES, type FieldType, type Item, type TagCategory } from "@/api/types";
import { useApp } from "@/store/app";
import { KIND_META, STATUS_META, TAG_META } from "@/lib/meta";
import { formatConfig, formatOfItem, useFormats } from "@/lib/formats";
import { date, uid } from "@/lib/format";
import { cn } from "@/lib/cn";
import { Popover } from "@/components/ui/Popover";
import { MenuItem, MenuLabel, MenuSep } from "@/components/ui/Menu";
import { FIELD_ICONS, FIELD_LABELS } from "@/components/settings/fieldIcons";
import { TagInput } from "./TagInput";
import { FieldInput } from "./FieldInput";
import { CategoryPicker } from "./CategoryPicker";

interface Row { key: string; icon: LucideIcon; label: string; node: React.ReactNode; custom?: string }

/**
 * The item's properties. Which ones show is decided per archive (saved in the archive's view):
 * in 속성 편집 mode every row gets an eye toggle, custom properties can be deleted, and
 * "속성 추가" adds a tag category / 품번 / 링크 or creates a new custom property.
 */
export function PropertyList({ item, editing, onDone }: { item: Item; editing: boolean; onDone: () => void }) {
  const s = useApp();
  const { updateItem, fields } = s;
  useFormats((f) => f.stored); // re-render when formats are edited
  const cfg = formatConfig(formatOfItem(item));
  const viewId = item.archiveId ? `arc:${item.archiveId}` : "sys:all";
  const layout = s.views.find((v) => v.id === viewId)?.card.props ?? {};
  const hidden = layout.hidden ?? [];
  const extra = layout.extra ?? [];
  const K = KIND_META[item.kind];
  const SM = STATUS_META[item.status];

  const tagCats: [TagCategory, string][] = [
    ...cfg.tagCats,
    ...extra.filter((k) => k.startsWith("tag:")).map((k) => [k.slice(4) as TagCategory, TAG_META[k.slice(4) as TagCategory].label] as [TagCategory, string])
      .filter(([c]) => !cfg.tagCats.some(([x]) => x === c)),
  ];
  const showCode = cfg.showCode || extra.includes("code");
  const showUrl = cfg.showUrl || extra.includes("url");

  const rows: Row[] = [
    {
      key: "kind", icon: K.icon, label: "종류",
      node: (
        <Popover width={170} trigger={({ toggle }) => (
          <button className="flex h-8 items-center gap-1.5 whitespace-nowrap rounded-md px-1.5 hover:bg-subtle" onClick={toggle}><K.icon size={14} />{K.label}</button>
        )}>
          {(close) => KINDS.map((k) => (
            <MenuItem key={k} icon={KIND_META[k].icon} checked={item.kind === k} onClick={() => { void updateItem(item.id, { kind: k }); close(); }}>{KIND_META[k].label}</MenuItem>
          ))}
        </Popover>
      ),
    },
    {
      key: "status", icon: SM.icon, label: "상태",
      node: (
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
      ),
    },
    { key: "category", icon: Folder, label: "카테고리", node: <CategoryPicker item={item} /> },
    ...tagCats.map(([c, label]): Row => ({ key: `tag:${c}`, icon: TAG_META[c].icon, label, node: <TagInput item={item} category={c} label={label} /> })),
    ...(showCode ? [{ key: "code", icon: Hash, label: "품번", node: <TextProp value={item.code} mono placeholder="ABC-123" onSave={(code) => void updateItem(item.id, { code })} /> }] : []),
    ...(showUrl ? [{
      key: "url", icon: Link2, label: "링크",
      node: (
        <div className="flex items-center">
          <TextProp value={item.url} placeholder="https://" onSave={(url) => void updateItem(item.id, { url })} />
          {item.url && <a href={item.url} target="_blank" rel="noreferrer" className="btn-icon h-7 w-7 shrink-0" data-tip="열기"><ExternalLink size={14} /></a>}
        </div>
      ),
    }] : []),
    { key: "year", icon: CalendarDays, label: "연도", node: <TextProp value={item.year?.toString() ?? null} placeholder="2024" onSave={(v) => void updateItem(item.id, { year: v && /^\d{4}$/.test(v) ? Number(v) : null })} /> },
    ...fields.map((f): Row => ({ key: `field:${f.id}`, icon: FIELD_ICONS[f.type], label: f.name, node: <FieldInput item={item} field={f} />, custom: f.id })),
    { key: "added", icon: CalendarPlus, label: "추가일", node: <span className="px-1.5 text-muted">{date(item.createdAt)}</span> },
  ];

  const toggle = (key: string) =>
    s.setPropLayout(item.archiveId, { hidden: hidden.includes(key) ? hidden.filter((k) => k !== key) : [...hidden, key] });
  const visible = editing ? rows : rows.filter((r) => !hidden.includes(r.key));

  // things that can be added: tag categories not shown yet, 품번/링크, or a brand-new custom property
  const addable = [
    ...TAG_CATEGORIES.filter((c) => !tagCats.some(([x]) => x === c)).map((c) => ({ key: `tag:${c}`, label: TAG_META[c].label, icon: TAG_META[c].icon })),
    ...(!showCode ? [{ key: "code", label: "품번", icon: Hash }] : []),
    ...(!showUrl ? [{ key: "url", label: "링크", icon: Link2 }] : []),
  ];

  return (
    <div className="mt-5">
      {editing && (
        <div className="mb-2 flex items-center gap-2 rounded-lg bg-accent/10 px-3 py-2 text-[length:calc(12px*var(--ts))] text-accent">
          <span className="flex-1">눈 아이콘으로 보이기·숨기기 · {s.archives.find((a) => a.id === item.archiveId)?.name ?? "이 아카이브"}의 모든 항목에 적용돼요</span>
          <button className="btn btn-primary h-7" onClick={onDone}>완료</button>
        </div>
      )}
      <div className="space-y-0.5">
        {visible.map((r) => {
          const off = hidden.includes(r.key);
          return (
            <div key={r.key} className={cn("group/prop flex min-h-8 items-start gap-2", editing && off && "opacity-40")}>
              <div className="flex h-8 w-[100px] shrink-0 items-center gap-2 text-[length:calc(12px*var(--ts))] text-muted">
                {editing ? (
                  <button className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md hover:bg-subtle hover:text-fg" onClick={() => toggle(r.key)} data-tip={off ? "보이기" : "숨기기"}>
                    {off ? <EyeOff size={14} /> : <Eye size={14} />}
                  </button>
                ) : (
                  <r.icon size={14} className="shrink-0" />
                )}
                <span className="truncate whitespace-nowrap">{r.label}</span>
              </div>
              <div className={cn("min-w-0 flex-1", editing && "pointer-events-none")}>{r.node}</div>
              {editing && r.custom && <DeleteField id={r.custom} name={r.label} />}
              {editing && !r.custom && extra.includes(r.key) && (
                <button className="btn-icon h-8 w-8 shrink-0 hover:text-danger" data-tip="속성 빼기"
                  onClick={() => s.setPropLayout(item.archiveId, { extra: extra.filter((k) => k !== r.key) })}><Trash2 size={13} /></button>
              )}
            </div>
          );
        })}
      </div>
      {editing && (
        <Popover width={240} trigger={({ toggle: t }) => (
          <button className="btn mt-2 w-full justify-center border border-dashed border-line text-muted" onClick={t}><ListPlus size={15} />속성 추가</button>
        )}>
          {(close) => (
            <div className="p-1">
              {addable.length > 0 && <MenuLabel>기본 속성</MenuLabel>}
              {addable.map((a) => (
                <MenuItem key={a.key} icon={a.icon} onClick={() => { s.setPropLayout(item.archiveId, { extra: [...extra, a.key], hidden: hidden.filter((k) => k !== a.key) }); close(); }}>{a.label}</MenuItem>
              ))}
              <MenuSep />
              <MenuLabel>새 속성 만들기 (모든 아카이브)</MenuLabel>
              <NewField onDone={close} />
            </div>
          )}
        </Popover>
      )}
    </div>
  );
}

function NewField({ onDone }: { onDone: () => void }) {
  const { saveField, fields } = useApp();
  const [name, setName] = useState("");
  const [type, setType] = useState<FieldType>("text");
  const add = async () => {
    if (!name.trim()) return;
    await saveField({ id: uid(), name: name.trim(), type, options: [], position: fields.length });
    onDone();
  };
  return (
    <div className="space-y-1.5 px-1 pb-1">
      <input autoFocus className="input h-8" placeholder="속성 이름" value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && void add()} />
      <div className="flex gap-1.5">
        <select className="input h-8 flex-1" value={type} onChange={(e) => setType(e.target.value as FieldType)}>
          {(Object.keys(FIELD_LABELS) as FieldType[]).map((t) => <option key={t} value={t}>{FIELD_LABELS[t]}</option>)}
        </select>
        <button className="btn btn-primary h-8" disabled={!name.trim()} onClick={() => void add()}>추가</button>
      </div>
    </div>
  );
}

function DeleteField({ id, name }: { id: string; name: string }) {
  const { deleteField } = useApp();
  const [sure, setSure] = useState(false);
  return sure ? (
    <button className="btn h-8 shrink-0 bg-danger/10 px-2 text-[length:calc(12px*var(--ts))] text-danger" onClick={() => void deleteField(id)} onMouseLeave={() => setSure(false)}>
      모든 항목에서 삭제
    </button>
  ) : (
    <button className="btn-icon h-8 w-8 shrink-0 hover:text-danger" data-tip={`"${name}" 속성 삭제`} onClick={() => setSure(true)}><Trash2 size={13} /></button>
  );
}

export function TextProp({ value, onSave, placeholder, mono }: { value: string | null; onSave: (v: string | null) => void; placeholder?: string; mono?: boolean }) {
  return (
    <input
      key={value ?? ""}
      defaultValue={value ?? ""}
      placeholder={placeholder}
      className={cn("h-8 w-full min-w-0 rounded-md bg-transparent px-1.5 outline-none placeholder:text-muted/50 hover:bg-subtle focus:bg-subtle", mono && "font-mono")}
      onBlur={(e) => { const v = e.target.value.trim() || null; if (v !== value) onSave(v); }}
      onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
    />
  );
}
