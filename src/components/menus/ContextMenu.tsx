import {
  Archive as ArchiveIcon, BookOpen, FolderInput, Gift, PanelRightOpen, Pin, PinOff, Star, Trash2, Wand2,
} from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useApp } from "@/store/app";
import { STATUS_META } from "@/lib/meta";
import { iconOf } from "@/lib/icons";
import { cn } from "@/lib/cn";
import { MenuItem, MenuLabel, MenuSep } from "@/components/ui/Menu";
import { IconGrid } from "@/components/ui/IconGrid";
import { isReadable } from "@/components/reader/source";

/** One global right-click menu (archives, custom views, items). Positioned at the cursor, kept on screen. */
export function ContextMenu() {
  const { menu, openMenu } = useApp();
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ x: 0, y: 0 });

  useLayoutEffect(() => {
    if (!menu || !ref.current) return;
    const r = ref.current.getBoundingClientRect();
    setPos({ x: Math.min(menu.x, innerWidth - r.width - 8), y: Math.max(8, Math.min(menu.y, innerHeight - r.height - 8)) });
  }, [menu]);

  useEffect(() => {
    if (!menu) return;
    const close = (e: Event) => { if (!(e.target instanceof Node && ref.current?.contains(e.target))) openMenu(null); };
    const key = (e: KeyboardEvent) => e.key === "Escape" && openMenu(null);
    document.addEventListener("mousedown", close);
    document.addEventListener("contextmenu", close, true);
    document.addEventListener("keydown", key);
    window.addEventListener("blur", () => openMenu(null), { once: true });
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("contextmenu", close, true);
      document.removeEventListener("keydown", key);
    };
  }, [menu, openMenu]);

  if (!menu) return null;
  const close = () => openMenu(null);
  return createPortal(
    <div ref={ref} className="popover anim-pop fixed z-[85] w-64" style={{ left: pos.x || menu.x, top: pos.y || menu.y }} onContextMenu={(e) => e.preventDefault()}>
      {menu.target.type === "archive" && <ArchiveMenu id={menu.target.id} close={close} />}
      {menu.target.type === "view" && <ViewMenu id={menu.target.id} close={close} />}
      {menu.target.type === "item" && <ItemMenu id={menu.target.id} close={close} />}
    </div>,
    document.body,
  );
}

function NameField({ value, onSave }: { value: string; onSave: (v: string) => void }) {
  return (
    <input
      autoFocus
      defaultValue={value}
      onFocus={(e) => e.currentTarget.select()}
      onBlur={(e) => { const v = e.target.value.trim(); if (v && v !== value) onSave(v); }}
      onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }}
      className="input h-8"
    />
  );
}

function ArchiveMenu({ id, close }: { id: string; close: () => void }) {
  const { archives, saveArchive, deleteArchive, counts } = useApp();
  const a = archives.find((x) => x.id === id);
  const [confirm, setConfirm] = useState(false);
  if (!a) return null;
  const n = counts.filter((c) => c.archiveId === id).reduce((s, c) => s + c.count, 0);
  return (
    <div className="p-1">
      <MenuLabel>이름</MenuLabel>
      <div className="px-1 pb-1"><NameField value={a.name} onSave={(name) => void saveArchive({ ...a, name })} /></div>
      <MenuLabel>아이콘</MenuLabel>
      <div className="px-1 pb-1"><IconGrid value={a.icon} onChange={(icon) => void saveArchive({ ...a, icon })} /></div>
      <MenuSep />
      <MenuItem icon={a.pinned ? PinOff : Pin} onClick={() => { void saveArchive({ ...a, pinned: !a.pinned }); close(); }}>{a.pinned ? "고정 해제" : "고정"}</MenuItem>
      {!confirm ? (
        <MenuItem icon={Trash2} danger onClick={() => setConfirm(true)}>아카이브 삭제</MenuItem>
      ) : (
        <div className="m-1 rounded-lg bg-danger/10 p-2 text-[length:calc(12px*var(--ts))]">
          <div className="text-danger">항목 {n}개도 함께 삭제돼요. 연결된 원본 파일은 남아 있어요.</div>
          <div className="mt-2 flex gap-1">
            <button className="btn h-7 flex-1 justify-center bg-danger text-white hover:bg-danger/90" onClick={() => { void deleteArchive(a.id); close(); }}>삭제</button>
            <button className="btn h-7 flex-1 justify-center border border-line" onClick={() => setConfirm(false)}>취소</button>
          </div>
        </div>
      )}
    </div>
  );
}

function ViewMenu({ id, close }: { id: string; close: () => void }) {
  const { views, setView, deleteView } = useApp();
  const v = views.find((x) => x.id === id);
  if (!v) return null;
  const save = (patch: Partial<typeof v>) => {
    const cur = useApp.getState().activeViewId;
    setView(v.id);
    useApp.getState().patchView(patch);
    if (cur !== v.id) setView(cur);
  };
  return (
    <div className="p-1">
      <MenuLabel>이름</MenuLabel>
      <div className="px-1 pb-1"><NameField value={v.name} onSave={(name) => save({ name })} /></div>
      <MenuLabel>아이콘</MenuLabel>
      <div className="px-1 pb-1"><IconGrid value={v.icon} onChange={(icon) => save({ icon })} /></div>
      <MenuSep />
      <MenuItem icon={Trash2} danger onClick={() => { void deleteView(v.id); close(); }}>보기 삭제</MenuItem>
    </div>
  );
}

function ItemMenu({ id, close }: { id: string; close: () => void }) {
  const s = useApp();
  const it = s.items.find((x) => x.id === id) ?? (s.detail?.id === id ? s.detail : undefined);
  const [sure, setSure] = useState(false);
  const [moving, setMoving] = useState(false);
  if (!it) return null;
  const readable = it.files.find(isReadable);
  const wish = it.list === "wishlist";
  const run = (fn: () => unknown) => { void fn(); close(); };
  return (
    <div className="p-1">
      <div className="truncate px-2 pb-1 pt-1.5 text-[length:calc(12px*var(--ts))] font-medium text-muted">{it.title}</div>
      <MenuItem icon={PanelRightOpen} onClick={() => run(() => s.select(it.id))}>열기</MenuItem>
      {readable && <MenuItem icon={BookOpen} onClick={() => run(() => s.openReader(it, readable))}>뷰어로 읽기</MenuItem>}
      <MenuSep />
      <div className="flex gap-0.5 px-1 py-0.5">
        {useApp.getState().statuses.map(({ id: st }) => {
          const M = STATUS_META[st];
          return (
            <button key={st} data-tip={M.label} onClick={() => run(() => s.updateItem(it.id, { status: st }))}
              className={cn("flex h-8 flex-1 items-center justify-center rounded-md hover:bg-subtle", M.tone, it.status === st && "tone-bg")}>
              <M.icon size={15} className="tone-text" />
            </button>
          );
        })}
      </div>
      <MenuSep />
      <MenuItem icon={it.pinned ? PinOff : Pin} onClick={() => run(() => s.updateItem(it.id, { pinned: !it.pinned }))}>{it.pinned ? "고정 해제" : "고정"}</MenuItem>
      <MenuItem icon={Star} onClick={() => run(() => s.updateItem(it.id, { favorite: !it.favorite }))}>{it.favorite ? "즐겨찾기 해제" : "즐겨찾기"}</MenuItem>
      <MenuItem icon={wish ? ArchiveIcon : Gift} onClick={() => run(() => s.updateItem(it.id, { list: wish ? "archive" : "wishlist" }))}>{wish ? "아카이브로 옮기기" : "위시리스트로 옮기기"}</MenuItem>
      <MenuItem icon={FolderInput} onClick={() => setMoving(!moving)}>다른 아카이브로 이동</MenuItem>
      {moving && (
        <div className="mx-1 mb-1 max-h-48 overflow-y-auto rounded-lg bg-subtle/60 p-1">
          {s.archives.filter((a) => a.id !== it.archiveId).map((a) => {
            const I = iconOf(a.icon);
            return <MenuItem key={a.id} icon={I} onClick={() => run(() => s.updateItem(it.id, { archiveId: a.id, kind: a.kind }))}>{a.name}</MenuItem>;
          })}
        </div>
      )}
      {it.kind !== "doujin" && <MenuItem icon={Wand2} onClick={() => run(() => s.setDialog({ type: "metadata", itemId: it.id }))}>정보 자동 검색</MenuItem>}
      <MenuSep />
      {!sure ? (
        <MenuItem icon={Trash2} danger onClick={() => setSure(true)}>삭제</MenuItem>
      ) : (
        <MenuItem icon={Trash2} danger className="bg-danger/10" onClick={() => run(() => s.deleteItem(it.id))}>한 번 더 누르면 삭제돼요</MenuItem>
      )}
    </div>
  );
}
