import { Plus, X } from "lucide-react";
import { useState } from "react";
import type { Item, TagCategory } from "@/api/types";
import { useApp } from "@/store/app";
import { Popover } from "@/components/ui/Popover";
import { TAG_META } from "@/lib/meta";

/** Chips for one tag category + popover to pick or create. */
export function TagInput({ item, category, label }: { item: Item; category: TagCategory; label?: string }) {
  const name = label ?? TAG_META[category].label;
  const { tags, ensureTag, updateItem } = useApp();
  const mine = item.tags.filter((t) => t.category === category);
  const [q, setQ] = useState("");
  const ids = item.tags.map((t) => t.id);
  const setIds = (next: string[]) => void updateItem(item.id, { tagIds: next });
  const pool = tags.filter((t) => t.category === category && !ids.includes(t.id) && t.name.toLowerCase().includes(q.toLowerCase()));
  const exact = tags.some((t) => t.category === category && t.name.toLowerCase() === q.trim().toLowerCase());

  const add = async (name: string) => {
    if (!name.trim()) return;
    const t = await ensureTag(name, category);
    // re-read latest tag ids (state may have changed while awaiting)
    const cur = useApp.getState().detail?.tags.map((x) => x.id) ?? ids;
    if (!cur.includes(t.id)) setIds([...cur, t.id]);
    setQ("");
  };

  return (
    <div className="flex min-h-8 flex-wrap items-center gap-1 py-1">
      {mine.map((t) => (
        <span key={t.id} className="chip group/chip min-w-0 max-w-full">
          <span className="truncate">{t.name}</span>
          <button className="text-muted opacity-0 hover:text-fg group-hover/chip:opacity-100" onClick={() => setIds(ids.filter((x) => x !== t.id))}>
            <X size={11} />
          </button>
        </span>
      ))}
      <Popover
        width={220}
        trigger={({ toggle }) => (
          <button className="flex h-6 w-6 items-center justify-center rounded-md text-muted hover:bg-subtle hover:text-fg" onClick={toggle} data-tip={`${name} 추가`}>
            <Plus size={14} />
          </button>
        )}
      >
        {(close) => (
          <div className="p-1">
            <input
              autoFocus
              className="input mb-1 h-7"
              placeholder={`${name} 검색 또는 생성`}
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") { void add(pool[0] && !q.trim() ? pool[0].name : q); }
                if (e.key === "Escape") close();
              }}
            />
            <div className="max-h-52 overflow-y-auto">
              {pool.slice(0, 50).map((t) => (
                <button key={t.id} className="menu-item" onClick={() => void add(t.name)}>{t.name}</button>
              ))}
              {q.trim() && !exact && (
                <button className="menu-item text-accent" onClick={() => void add(q)}>
                  <Plus size={14} />"{q.trim()}" 만들기
                </button>
              )}
              {!pool.length && !q.trim() && <div className="px-2 py-1.5 text-[length:calc(12px*var(--ts))] text-muted">입력해서 새로 만드세요</div>}
            </div>
          </div>
        )}
      </Popover>
    </div>
  );
}
