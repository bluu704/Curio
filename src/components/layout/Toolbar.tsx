import {
  ArrowDown, ArrowUp, ArrowUpDown, ClipboardPaste, Menu, FileUp, FolderPlus, FolderTree, LayoutDashboard,
  LayoutGrid, Link2, List, ListFilter, Plus, Search, SlidersHorizontal, Star, Table2, X,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { api } from "@/api";
import { type CardAspect, type FileKind, type CardField, type CardSize, type Layout, type SortField } from "@/api/types";
import { activeView, useApp } from "@/store/app";
import { allColumns, normalizeColumn } from "@/components/views/columns";
import { propLabels } from "@/lib/properties";
import { FILE_META, STATUS_META, TAG_META } from "@/lib/meta";
import { iconOf } from "@/lib/icons";
import { useNarrow } from "@/hooks/useNarrow";
import { cn } from "@/lib/cn";
import { Popover } from "@/components/ui/Popover";
import { Segmented } from "@/components/ui/Segmented";
import { Stars } from "@/components/ui/Stars";
import { MenuItem, MenuLabel, MenuSep } from "@/components/ui/Menu";

export function Toolbar() {
  const s = useApp();
  const view = activeView(s);
  const archive = s.archives.find((a) => a.id === view.query.archiveId);
  const Icon = iconOf(archive && view.query.list !== "wishlist" ? archive.icon : view.icon);
  const searchRef = useRef<HTMLInputElement>(null);
  const uploadRef = useRef<HTMLInputElement>(null);
  const folderRef = useRef<HTMLInputElement>(null);
  const narrow = useNarrow();
  const [renaming, setRenaming] = useState(false);



  const q = view.query;
  // Filters beyond what the archive itself implies (sys views already fix kind/list).
  const baseKinds: string[] = [];
  const filterCount =
    (q.kinds ?? []).filter((k) => !baseKinds.includes(k)).length + (q.fileKinds?.length ?? 0) + (q.statuses?.length ?? 0) + (q.tagIds?.length ?? 0) + (q.favorite && view.id !== "sys:fav" ? 1 : 0) + (q.minRating ? 1 : 0);

  return (
    <header className="flex h-12 shrink-0 items-center gap-2 border-b border-line bg-bg/80 px-4 backdrop-blur max-md:px-3">
      <button className="btn-icon -ml-2 md:hidden" onClick={() => s.setDrawer(true)} aria-label="메뉴"><Menu size={18} /></button>
      <div className="flex min-w-0 items-center gap-2">
        <Icon size={17} className="shrink-0 text-muted" />
        {renaming ? (
          <input
            autoFocus
            defaultValue={view.name}
            className="input h-7 w-40"
            onBlur={(e) => {
              const name = e.target.value.trim();
              if (name && name !== view.name) {
                if (archive && view.query.list !== "wishlist") void s.saveArchive({ ...archive, name });
                else if (!view.id.startsWith("sys:")) s.patchView({ name });
              }
              setRenaming(false);
            }}
            onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); if (e.key === "Escape") setRenaming(false); }}
          />
        ) : (
          <h1 className="truncate whitespace-nowrap text-[length:calc(14px*var(--ts))] font-semibold" onDoubleClick={() => setRenaming(true)}
            onContextMenu={(e) => {
              e.preventDefault();
              const target = archive ? { type: "archive" as const, id: archive.id } : !view.id.startsWith("sys:") ? { type: "view" as const, id: view.id } : null;
              if (target) s.openMenu({ x: e.clientX, y: e.clientY, target });
            }}>{view.name}</h1>
        )}
        <span className="rounded-md bg-subtle px-1.5 text-[length:calc(11px*var(--ts))] font-medium tabular-nums text-muted">{s.items.length}</span>
      </div>

      <div className="ml-auto flex min-w-0 items-center gap-1 overflow-x-auto">
        <label className="relative mr-1 shrink-0">
          <Search size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted" />
          <input
            ref={searchRef}
            data-search-input
            value={s.search}
            onChange={(e) => s.setSearch(e.target.value)}
            placeholder={narrow ? "검색" : "검색  Ctrl+F"}
            className="input h-8 w-28 pl-8 pr-7 sm:w-52"
          />
          {s.search && (
            <button className="absolute right-1.5 top-1/2 -translate-y-1/2 text-muted hover:text-fg" onClick={() => s.setSearch("")}>
              <X size={14} />
            </button>
          )}
        </label>

        <button className={cn("btn-icon", (narrow ? s.catDrawer : s.showCategories) && "active")} onClick={() => (narrow ? s.setCatDrawer(!s.catDrawer) : s.toggleCategories())} data-tip="폴더 패널"><FolderTree size={17} /></button>

        {/* Filter */}
        <Popover
          align="end"
          width={300}
          trigger={({ open, toggle }) => (
            <button className={cn("btn-icon relative", (open || filterCount > 0) && "active")} onClick={toggle} data-tip="필터">
              <ListFilter size={17} />
              {filterCount > 0 && (
                <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-accent px-1 text-[length:calc(10px*var(--ts))] font-bold text-accent-fg">
                  {filterCount}
                </span>
              )}
            </button>
          )}
        >
          <FilterPanel />
        </Popover>

        {/* Sort */}
        <Popover
          align="end"
          width={200}
          trigger={({ open, toggle }) => (
            <button className={cn("btn-icon", open && "active")} onClick={toggle} data-tip="정렬"><ArrowUpDown size={17} /></button>
          )}
        >
          {(close) => {
            const cur = q.sort ?? { field: "updatedAt" as SortField, dir: "desc" as const };
            const opts: [SortField, string][] = [["updatedAt", "최근 수정"], ["createdAt", "추가한 날짜"], ["title", "제목"], ["rating", "평점"]];
            return (
              <>
                <MenuLabel>정렬 기준</MenuLabel>
                {opts.map(([f, l]) => (
                  <MenuItem key={f} checked={cur.field === f} onClick={() => { s.patchView({ query: { ...q, sort: { ...cur, field: f } } }); close(); }}>{l}</MenuItem>
                ))}
                <MenuSep />
                <MenuItem icon={ArrowUp} checked={cur.dir === "asc"} onClick={() => s.patchView({ query: { ...q, sort: { ...cur, dir: "asc" } } })}>오름차순</MenuItem>
                <MenuItem icon={ArrowDown} checked={cur.dir === "desc"} onClick={() => s.patchView({ query: { ...q, sort: { ...cur, dir: "desc" } } })}>내림차순</MenuItem>
              </>
            );
          }}
        </Popover>

        {/* Display options */}
        <Popover
          align="end"
          width={260}
          trigger={({ open, toggle }) => (
            <button className={cn("btn-icon", open && "active")} onClick={toggle} data-tip="표시 설정"><SlidersHorizontal size={17} /></button>
          )}
        >
          <DisplayPanel />
        </Popover>

        <div className="mx-1 h-5 w-px bg-line" />

        <Segmented<Layout>
          value={view.layout}
          onChange={(layout) => s.patchView({ layout })}
          options={[
            { value: "gallery", icon: LayoutGrid, tip: "갤러리" },
            { value: "masonry", icon: LayoutDashboard, tip: "모자이크 (일러스트)" },
            { value: "table", icon: Table2, tip: "테이블" },
            { value: "list", icon: List, tip: "리스트" },
          ]}
        />
      </div>

      {/* outside the scrolling row so "+" is always on screen, also on phones */}
      <div className="shrink-0">
        <Popover
          align="end"
          width={236}
          trigger={({ toggle }) => (
            <button className="btn btn-primary ml-1 h-8 px-2.5" onClick={toggle} data-tip="추가 (Ctrl+N)">
              <Plus size={16} />
            </button>
          )}
        >
          {(close) => (
            <>
              <MenuItem icon={Plus} onClick={() => { void s.createItem({ title: "제목 없음" }); close(); }}>새 항목</MenuItem>
              <MenuItem icon={Link2} onClick={() => { s.setDialog({ type: "link" }); close(); }}>링크·제목으로 추가</MenuItem>
              <MenuItem icon={ClipboardPaste} onClick={() => { s.setDialog({ type: "import" }); close(); }}>목록 붙여넣기</MenuItem>
              <MenuSep />
              {/* any file type: browser uploads, desktop links the originals */}
              <MenuItem icon={FileUp} onClick={async () => {
                close();
                if (api.importBlobs) return uploadRef.current?.click();
                const p = await api.pickPaths({ multiple: true });
                if (p) await s.importPaths(p);
              }}>파일 올리기</MenuItem>
              <MenuItem icon={FolderPlus} onClick={async () => {
                close();
                if (api.importBlobs) return folderRef.current?.click(); // browser: pick a folder, one item per folder
                const p = await api.pickPaths({ directory: true, multiple: true });
                if (p) await s.importPaths(p);
              }}>폴더에서 가져오기</MenuItem>
            </>
          )}
        </Popover>
      </div>
      <input ref={uploadRef} type="file" multiple hidden onChange={(e) => { void s.importBlobs([...(e.target.files ?? [])]); e.target.value = ""; }} />
      <input ref={folderRef} type="file" multiple hidden {...{ webkitdirectory: "", directory: "" }} onChange={(e) => { void s.importFolders([...(e.target.files ?? [])]); e.target.value = ""; }} />
    </header>
  );
}

const FILE_LABEL: Record<FileKind, string> = { image: "이미지", video: "동영상", audio: "음악", document: "문서", archive: "압축", text: "텍스트", folder: "폴더", other: "기타" };
const FILE_ORDER: FileKind[] = ["image", "video", "audio", "document", "archive", "text", "folder", "other"];

function FilterPanel() {
  const s = useApp();
  const view = activeView(s);
  const q = view.query;
  // formats that exist in this view (looked up without the format filter itself)
  const [present, setPresent] = useState<FileKind[]>([]);
  useEffect(() => {
    void api.listItems({ ...q, fileKinds: undefined, categoryId: s.categoryId ?? undefined }).then((items) => {
      const have = new Set(items.flatMap((i) => i.files.map((f) => f.kind)));
      setPresent(FILE_ORDER.filter((k) => have.has(k)));
    });
  }, [view.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const formats = FILE_ORDER.filter((k) => present.includes(k) || q.fileKinds?.includes(k));
  const set = (patch: Partial<typeof q>) => s.patchView({ query: { ...q, ...patch } });
  const toggle = <T,>(arr: T[] | undefined, v: T) => (arr?.includes(v) ? arr.filter((x) => x !== v) : [...(arr ?? []), v]);
  const [tagSearch, setTagSearch] = useState("");
  const tags = s.tags.filter((t) => !tagSearch || t.name.toLowerCase().includes(tagSearch.toLowerCase()));

  return (
    <div className="space-y-3 p-2">
      {formats.length > 0 && (
        <section>
          <div className="label mb-1.5">형식</div>
          <div className="flex flex-wrap gap-1">
            {formats.map((k) => {
              const I = FILE_META[k];
              const on = q.fileKinds?.includes(k);
              return (
                <button key={k} onClick={() => set({ fileKinds: toggle(q.fileKinds, k) })}
                  className={cn("chip h-7 cursor-pointer gap-1 border px-2", on ? "border-accent/50 bg-accent/10 text-accent" : "border-line bg-transparent")}>
                  <I size={13} />{FILE_LABEL[k]}
                </button>
              );
            })}
          </div>
        </section>
      )}
      <section>
        <div className="label mb-1.5">상태</div>
        <div className="flex flex-wrap gap-1">
          {useApp.getState().statuses.map(({ id: st }) => {
            const M = STATUS_META[st];
            const on = q.statuses?.includes(st);
            return (
              <button key={st} onClick={() => set({ statuses: toggle(q.statuses, st) })}
                className={cn("chip h-7 cursor-pointer border px-2", M.tone, on ? "tone-bg border-transparent" : "border-line bg-transparent")}>
                <M.icon size={13} className="tone-text" />{M.label}
              </button>
            );
          })}
        </div>
      </section>
      <section className="flex items-center justify-between">
        <div className="label">최소 평점</div>
        <Stars value={q.minRating ?? null} onChange={(v) => set({ minRating: v ?? undefined })} size={16} />
      </section>
      <section className="flex items-center justify-between">
        <div className="label">즐겨찾기만</div>
        <button className={cn("btn-icon", q.favorite && "text-amber-400")} onClick={() => set({ favorite: !q.favorite || undefined })}>
          <Star size={16} fill={q.favorite ? "currentColor" : "none"} />
        </button>
      </section>
      <section>
        <div className="label mb-1.5">태그 · 작가 · 장르 (모두 포함)</div>
        <input className="input mb-1.5 h-7" placeholder="찾기…" value={tagSearch} onChange={(e) => setTagSearch(e.target.value)} />
        <div className="flex max-h-36 flex-wrap gap-1 overflow-y-auto">
          {tags.map((t) => {
            const on = q.tagIds?.includes(t.id);
            const TI = TAG_META[t.category].icon;
            return (
              <button key={t.id} onClick={() => set({ tagIds: toggle(q.tagIds, t.id) })}
                className={cn("chip cursor-pointer", on && "bg-accent/15 text-accent")}>
                <TI size={11} className="opacity-60" />{t.name}
              </button>
            );
          })}
        </div>
      </section>
      <button className="btn w-full justify-center text-muted" onClick={() => s.patchView({ query: { archiveId: q.archiveId, list: q.list, favorite: view.id === "sys:fav" || undefined, sort: q.sort } })}>
        <X size={14} />필터 초기화
      </button>
    </div>
  );
}

function DisplayPanel() {
  const s = useApp();
  const view = activeView(s);
  const c = view.card;
  const setCard = (patch: Partial<typeof c>) => s.patchView({ card: { ...c, ...patch } });

  if (view.layout === "table") {
    const all = allColumns(s.fields, propLabels());
    const cur = [...new Set(view.columns.map(normalizeColumn))];
    const toggleCol = (k: string) => s.patchView({ columns: cur.includes(k) ? cur.filter((x) => x !== k) : [...cur, k] });
    return (
      <div className="p-1">
        <MenuLabel>표시할 열</MenuLabel>
        <div className="max-h-[60vh] overflow-y-auto">
          {all.map((c) => <MenuItem key={c.key} icon={c.icon} checked={cur.includes(c.key)} onClick={() => toggleCol(c.key)}>{c.label}</MenuItem>)}
        </div>
      </div>
    );
  }

  const fields: [CardField, string][] = [["status", "상태"], ["rating", "평점"], ["author", "작가"], ["tags", "태그"], ["files", "파일 수"]];
  return (
    <div className="space-y-3 p-2">
      {(view.layout === "gallery" || view.layout === "masonry") && (
        <>
          <Row label="카드 크기">
            <Segmented<CardSize> value={c.size} onChange={(size) => setCard({ size })}
              options={[{ value: "s", label: "S" }, { value: "m", label: "M" }, { value: "l", label: "L" }]} />
          </Row>
          {view.layout === "gallery" && <Row label="비율">
            <Segmented<CardAspect> value={c.aspect} onChange={(aspect) => setCard({ aspect })}
              options={[{ value: "2/3", label: "2:3" }, { value: "3/4", label: "3:4" }, { value: "1/1", label: "1:1" }, { value: "16/9", label: "16:9" }]} />
          </Row>}
          {view.layout === "gallery" && <Row label="이미지">
            <Segmented value={c.fit} onChange={(fit) => setCard({ fit })}
              options={[{ value: "cover", label: "채우기" }, { value: "contain", label: "맞추기" }]} />
          </Row>}
          <Row label={view.layout === "masonry" ? "그림 아래 제목" : "제목"}>
            <Segmented value={c.showTitle ? "on" : "off"} onChange={(v) => setCard({ showTitle: v === "on" })}
              options={[{ value: "on", label: "표시" }, { value: "off", label: "숨김" }]} />
          </Row>
        </>
      )}
      <div>
        <div className="label mb-1">{view.layout === "masonry" ? "마우스를 올리면 표시" : "카드에 표시"}</div>
        {fields.filter(([k]) => view.layout !== "masonry" || k === "rating" || k === "author").map(([k, l]) => (
          <MenuItem key={k} checked={c.fields.includes(k)}
            onClick={() => setCard({ fields: c.fields.includes(k) ? c.fields.filter((x) => x !== k) : [...c.fields, k] })}>
            {l}
          </MenuItem>
        ))}
      </div>
    </div>
  );
}

const Row = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <div className="flex items-center justify-between gap-2">
    <div className="label">{label}</div>
    {children}
  </div>
);
