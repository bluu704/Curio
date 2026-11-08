import { Link2, Plus, Search, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { api } from "@/api";
import type { Item } from "@/api/types";
import { useApp } from "@/store/app";
import { Cover } from "@/components/ui/Cover";
import { Popover } from "@/components/ui/Popover";

const linksOf = (it: Item): string[] => (Array.isArray(it.props?._links) ? (it.props._links as string[]) : []);

/** Every item of the library (archive + wishlist), for linking and back-links. */
async function allItems(): Promise<Item[]> {
  const [a, w] = await Promise.all([api.listItems({}), api.listItems({ list: "wishlist" })]);
  const seen = new Set<string>();
  return [...a, ...w].filter((i) => !seen.has(i.id) && seen.add(i.id));
}

/**
 * 연결: links to other items (kept in props._links, so they sync), shown on both items.
 * Clicking one opens it in the panel; the header's back arrow returns.
 */
export function LinksSection({ item }: { item: Item }) {
  const { updateItem, openLinked, archives } = useApp();
  const [all, setAll] = useState<Item[] | null>(null);
  const [q, setQ] = useState("");
  useEffect(() => { let alive = true; void allItems().then((x) => alive && setAll(x)); return () => { alive = false; }; }, [item.id, item.updatedAt]);

  const mine = linksOf(item);
  const linked = useMemo(() => {
    if (!all) return [];
    const ids = new Set([...mine, ...all.filter((o) => linksOf(o).includes(item.id)).map((o) => o.id)]);
    ids.delete(item.id);
    return all.filter((o) => ids.has(o.id));
  }, [all, mine, item.id]);
  const candidates = useMemo(() => {
    const t = q.trim().toLowerCase();
    return (all ?? []).filter((o) => o.id !== item.id && !linked.some((l) => l.id === o.id) && (!t || o.title.toLowerCase().includes(t))).slice(0, 30);
  }, [all, q, linked, item.id]);

  const add = (o: Item) => void updateItem(item.id, { props: { ...item.props, _links: [...mine.filter((x) => x !== o.id), o.id] } });
  const remove = async (o: Item) => {
    if (mine.includes(o.id)) await updateItem(item.id, { props: { ...item.props, _links: mine.filter((x) => x !== o.id) } });
    if (linksOf(o).includes(item.id)) await updateItem(o.id, { props: { ...o.props, _links: linksOf(o).filter((x) => x !== item.id) } });
    setAll(await allItems());
  };
  const archiveName = (o: Item) => archives.find((a) => a.id === o.archiveId)?.name;

  return (
    <div className="mt-6 border-t border-line pt-5">
      <div className="mb-2 flex items-center">
        <div className="label flex-1">연결 · {linked.length}</div>
        <Popover width={300} align="end" trigger={({ toggle }) => (
          <button className="btn-icon h-7 w-7" onClick={() => { setQ(""); toggle(); }} data-tip="항목 연결"><Plus size={15} /></button>
        )}>
          {(close) => (
            <div className="p-1.5">
              <div className="relative mb-1.5">
                <Search size={13} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted" />
                <input autoFocus className="input h-8 pl-7" placeholder="제목 검색" value={q} onChange={(e) => setQ(e.target.value)} />
              </div>
              <div className="max-h-72 overflow-y-auto">
                {candidates.map((o) => (
                  <button key={o.id} onClick={() => { add(o); close(); }} className="flex w-full items-center gap-2 rounded-md px-1.5 py-1 text-left hover:bg-subtle">
                    <Cover item={o} className="h-9 w-7 shrink-0 rounded" iconSize={11} />
                    <span className="min-w-0 flex-1 truncate">{o.title}</span>
                    {archiveName(o) && <span className="shrink-0 text-[length:calc(11px*var(--ts))] text-muted">{archiveName(o)}</span>}
                  </button>
                ))}
                {all && !candidates.length && <div className="px-2 py-3 text-center text-[length:calc(12px*var(--ts))] text-muted">결과가 없어요</div>}
              </div>
            </div>
          )}
        </Popover>
      </div>
      {linked.length > 0 && (
        <div className="grid grid-cols-2 gap-1.5 max-sm:grid-cols-1">
          {linked.map((o) => (
            <div key={o.id} className="group flex min-w-0 items-center gap-2 rounded-lg border border-line p-1.5 hover:bg-subtle">
              <button className="flex min-w-0 flex-1 items-center gap-2 text-left" onClick={() => void openLinked(o.id)} data-tip="열기">
                <Cover item={o} className="h-10 w-8 shrink-0 rounded" iconSize={12} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[length:calc(13px*var(--ts))] font-medium">{o.title}</span>
                  {archiveName(o) && <span className="flex items-center gap-1 truncate text-[length:calc(11px*var(--ts))] text-muted"><Link2 size={10} />{archiveName(o)}</span>}
                </span>
              </button>
              <button className="btn-icon touch-show h-7 w-7 shrink-0 opacity-0 group-hover:opacity-100 hover:text-danger" onClick={() => void remove(o)} data-tip="연결 끊기"><X size={13} /></button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
