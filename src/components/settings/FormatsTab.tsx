import { ChevronDown, Plus, RotateCcw, Trash2 } from "lucide-react";
import { useState } from "react";
import { TAG_CATEGORIES, type CardAspect, type Layout, type TagCategory } from "@/api/types";
import { useFormats, type Format } from "@/lib/formats";
import { TAG_META } from "@/lib/meta";
import { iconOf } from "@/lib/icons";
import { uid } from "@/lib/format";
import { cn } from "@/lib/cn";
import { Popover } from "@/components/ui/Popover";
import { IconGrid } from "@/components/ui/IconGrid";
import { Segmented } from "@/components/ui/Segmented";

/** Settings → 형식: add, edit, hide/delete archive formats. */
export function FormatsTab() {
  const fm = useFormats();
  const list = fm.all();
  const hidden = fm.stored.hidden;
  const [open, setOpen] = useState<string | null>(null);
  const add = async () => {
    const f: Format = { id: `fmt:${uid()}`, name: "새 형식", icon: "package", base: "other", aspect: "3/4", layout: "gallery", tagCats: [["author", "작가"], ["tag", "태그"]], showUrl: true, custom: true };
    await fm.save(f);
    setOpen(f.id);
  };
  return (
    <div className="space-y-3">
      <div className="space-y-1">
        {list.map((f) => <FormatRow key={f.id} f={f} open={open === f.id} onToggle={() => setOpen(open === f.id ? null : f.id)} />)}
      </div>
      <button className="btn w-full justify-center border border-dashed border-line text-muted" onClick={() => void add()}><Plus size={15} />형식 추가</button>
      {hidden.length > 0 && (
        <button className="w-full text-center text-[length:calc(12px*var(--ts))] text-muted hover:text-fg hover:underline" onClick={() => void Promise.all(hidden.map((id) => fm.restore(id)))}>
          삭제한 기본 형식 {hidden.length}개 되살리기
        </button>
      )}
    </div>
  );
}

function FormatRow({ f, open, onToggle }: { f: Format; open: boolean; onToggle: () => void }) {
  const fm = useFormats();
  const I = iconOf(f.icon);
  const save = (p: Partial<Format>) => void fm.save({ ...f, ...p });
  const has = (c: TagCategory) => f.tagCats.some(([x]) => x === c);
  const toggleCat = (c: TagCategory) => save({ tagCats: has(c) ? f.tagCats.filter(([x]) => x !== c) : [...f.tagCats, [c, TAG_META[c].label]] });
  const relabel = (c: TagCategory, label: string) => save({ tagCats: f.tagCats.map(([x, l]) => (x === c ? [x, label || TAG_META[c].label] : [x, l])) });
  return (
    <div className="rounded-lg border border-line">
      <div className="flex h-11 cursor-pointer items-center gap-2 px-2" onClick={onToggle}>
        <span className="flex h-7 w-7 items-center justify-center rounded-md bg-subtle"><I size={15} /></span>
        <span className="min-w-0 flex-1 truncate font-medium">{f.name}</span>
        <ChevronDown size={15} className={cn("text-muted transition-transform", open && "rotate-180")} />
      </div>
      {open && (
        <div className="space-y-3 border-t border-line p-3">
          <div className="flex gap-2">
            <Popover width={260} trigger={({ toggle }) => (
              <button className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-line hover:bg-subtle" onClick={toggle} data-tip="아이콘"><I size={17} /></button>
            )}>
              <div className="p-1.5"><IconGrid value={f.icon} onChange={(icon) => save({ icon })} /></div>
            </Popover>
            <input className="input h-9 flex-1" defaultValue={f.name} onBlur={(e) => e.target.value.trim() && save({ name: e.target.value.trim() })} />
          </div>
          <Row label="카드 비율">
            <Segmented<CardAspect> value={f.aspect} onChange={(aspect) => save({ aspect })}
              options={[{ value: "2/3", label: "2:3" }, { value: "3/4", label: "3:4" }, { value: "1/1", label: "1:1" }, { value: "16/9", label: "16:9" }]} />
          </Row>
          <Row label="기본 보기">
            <Segmented<Layout> value={f.layout} onChange={(layout) => save({ layout })}
              options={[{ value: "gallery", label: "갤러리" }, { value: "masonry", label: "모자이크" }, { value: "table", label: "표" }, { value: "list", label: "목록" }]} />
          </Row>
          <div>
            <div className="label mb-1.5">속성 (이름을 바꿀 수 있어요)</div>
            <div className="space-y-1">
              {TAG_CATEGORIES.map((c) => {
                const T = TAG_META[c].icon;
                const label = f.tagCats.find(([x]) => x === c)?.[1];
                return (
                  <div key={c} className="flex items-center gap-2">
                    <input type="checkbox" checked={has(c)} onChange={() => toggleCat(c)} className="h-4 w-4 accent-[rgb(var(--accent))]" />
                    <T size={14} className="text-muted" />
                    <input className="input h-7 flex-1" disabled={!has(c)} defaultValue={label ?? TAG_META[c].label} key={`${c}:${label}`} onBlur={(e) => has(c) && relabel(c, e.target.value.trim())} />
                  </div>
                );
              })}
              <label className="flex items-center gap-2"><input type="checkbox" checked={!!f.showUrl} onChange={(e) => save({ showUrl: e.target.checked })} className="h-4 w-4 accent-[rgb(var(--accent))]" />링크</label>
              <label className="flex items-center gap-2"><input type="checkbox" checked={!!f.showCode} onChange={(e) => save({ showCode: e.target.checked })} className="h-4 w-4 accent-[rgb(var(--accent))]" />품번</label>
            </div>
          </div>
          <div className="flex justify-end gap-2">
            {!f.custom && fm.stored.overrides[f.id] && <button className="btn h-8 border border-line" onClick={() => void fm.restore(f.id)}><RotateCcw size={14} />처음 상태로</button>}
            <button className="btn h-8 border border-line text-danger" onClick={() => void fm.remove(f.id)}><Trash2 size={14} />삭제</button>
          </div>
        </div>
      )}
    </div>
  );
}

const Row = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <div className="flex items-center justify-between gap-2"><span className="label">{label}</span>{children}</div>
);
