import {
  type LucideIcon, ArrowLeft, Film, Archive, CalendarDays, CalendarOff, Cloud, CloudOff, ChevronsRight, Ellipsis, Maximize2, Minimize2, Gift, ImageMinus, ImagePlus, Pin, Play, SlidersHorizontal, Star, Trash2, Wand2,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { api } from "@/api";
import type { Item } from "@/api/types";
import { useApp } from "@/store/app";
import { KIND_META, TAG_META } from "@/lib/meta";
import { formatConfig, formatOfItem, useFormats } from "@/lib/formats";
import { cn } from "@/lib/cn";
import { LyricsSection } from "./LyricsSection";
import { cloudProps, FLAG, isCalendarHidden, isCloudSynced, mainFile, withFlag } from "@/lib/itemFlags";
import { MainContent } from "./MainContent";
import { LinksSection } from "./LinksSection";
import { AudioPlayer, YouTubePlayer } from "./Players";
import { Cover } from "@/components/ui/Cover";
import { Popover } from "@/components/ui/Popover";
import { Stars } from "@/components/ui/Stars";
import { MenuItem, MenuSep } from "@/components/ui/Menu";
import { PropertyList } from "./PropertyList";
import { fileAction } from "./FileList";
import { isViewable } from "@/components/viewer/files";
import { isReadable } from "@/components/reader/source";
import { FileList } from "./FileList";
import { BlockEditor } from "./BlockEditor";

const ytId = (url: string | null) => url?.match(/(?:v=|youtu\.be\/|shorts\/|embed\/)([A-Za-z0-9_-]{11})/)?.[1] ?? null;

export function DetailPanel() {
  const { detail: item, select, updateItem, deleteItem, setDialog, openReader } = useApp();
  const [editProps, setEditProps] = useState(false);
  useFormats((f) => f.stored);
  const full = useApp((st) => st.detailFull);
  const linkBack = useApp((st) => st.linkBack);
  const toggleFull = useApp((st) => st.toggleDetailFull);

  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if (e.key === "Escape" && !["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName) && !useApp.getState().reader && !useApp.getState().dialog) void select(null);
    };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [select]);

  if (!item) return null;
  const K = KIND_META[item.kind];
  const cfg = formatConfig(formatOfItem(item));
  // primary file action: read (pdf/zip/images) › play (video/audio) › view (text) › open with the OS
  const primary = item.files.find(isReadable) ?? item.files.find(isViewable) ?? item.files[0];
  const act = primary ? fileAction(primary) : null;
  // the item's own file / its song already play inline → no extra open button for them
  const inlineSong = item.kind === "music" ? item.files.find((f) => f.kind === "audio") : undefined;
  const showOpen = !!primary && primary.id !== mainFile(item)?.id && primary.id !== inlineSong?.id;
  const banner = api.mediaUrl(item.bannerUri);
  const yt = item.kind === "music" ? ytId(item.url) : null;
  const wish = item.list === "wishlist";
  const people = item.tags.filter((t) => ["author", "studio", "circle", "director"].includes(t.category)).slice(0, 3);

  const main = mainFile(item);
  const song = item.files.find((f) => f.kind === "audio");
  const cloud = isCloudSynced(item);
  const calHidden = isCalendarHidden(item);
  return (
    <aside key={item.id} data-drop-attach={item.id}
      onContextMenu={(e) => { if ((e.target as HTMLElement).closest("input,textarea")) return; e.preventDefault(); useApp.getState().openMenu({ x: e.clientX, y: e.clientY, target: { type: "item", id: item.id } }); }}
      className={cn("anim-slide absolute inset-y-0 right-0 z-30 flex w-full flex-col bg-surface",
        full ? "left-0" : "border-l border-line shadow-pop md:w-[460px]")}>
      <div className="flex h-12 shrink-0 items-center gap-0.5 border-b border-line px-2">
        <button className="btn-icon" onClick={() => void select(null)} data-tip="닫기 (Esc)"><ChevronsRight size={17} /></button>
        {linkBack.length > 0 && <button className="btn-icon" onClick={() => void useApp.getState().linkGoBack()} data-tip="이전 항목으로"><ArrowLeft size={17} /></button>}
        <button className="btn-icon max-md:hidden" onClick={toggleFull} data-tip={full ? "패널로 보기" : "전체 화면"}>
          {full ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
        </button>
        <div className="flex-1" />
        {showOpen && act && (
          <button className="btn btn-primary mr-1 h-8 px-2.5" onClick={() => openReader(item, primary)} data-tip={primary.name}>
            <act.icon size={15} />{act.label.split("·")[0]}
          </button>
        )}
        {showOpen && !act && (
          <button className="btn-icon" onClick={() => void api.openFile(primary)} data-tip={`열기: ${primary.name}`}><Play size={16} /></button>
        )}
        {item.kind !== "doujin" && (
          <button className="btn-icon" onClick={() => setDialog({ type: "metadata", itemId: item.id })} data-tip="정보·이미지 자동 검색"><Wand2 size={16} /></button>
        )}
        <button
          className={cn("btn-icon", wish && "text-pink-500 hover:text-pink-500")}
          onClick={() => void updateItem(item.id, { list: wish ? "archive" : "wishlist" })}
          data-tip={wish ? "아카이브로 옮기기" : "위시리스트로 옮기기"}
        >
          {wish ? <Gift size={16} /> : <Archive size={16} />}
        </button>
        <button className={cn("btn-icon", cloud && "text-sky-500 hover:text-sky-500")}
          onClick={() => {
            void updateItem(item.id, { props: cloudProps(item, !cloud) });
            useApp.getState().notify(cloud ? "이 기기에만 둬요" : "클라우드에 올려요");
          }}
          data-tip={cloud ? "클라우드 켜짐" : "클라우드 꺼짐 (이 기기에만)"}>
          {cloud ? <Cloud size={16} /> : <CloudOff size={16} />}
        </button>
        <button className={cn("btn-icon", item.pinned && "text-accent hover:text-accent")} onClick={() => void updateItem(item.id, { pinned: !item.pinned })} data-tip={item.pinned ? "고정 해제 (P)" : "고정 (P)"}>
          <Pin size={16} fill={item.pinned ? "currentColor" : "none"} />
        </button>
        <button className={cn("btn-icon", item.favorite && "text-amber-400 hover:text-amber-400")} onClick={() => void updateItem(item.id, { favorite: !item.favorite })} data-tip="즐겨찾기">
          <Star size={16} fill={item.favorite ? "currentColor" : "none"} />
        </button>
        <Popover align="end" width={200} trigger={({ toggle }) => <button className="btn-icon" onClick={toggle} data-tip="더보기"><Ellipsis size={16} /></button>}>
          {(close) => (
            <>
              <MenuItem icon={calHidden ? CalendarDays : CalendarOff} onClick={() => { close(); void updateItem(item.id, { props: withFlag(item, FLAG.calendarHidden, !calHidden) }); }}>
                {calHidden ? "캘린더에 다시 표시" : "캘린더에서 숨기기"}
              </MenuItem>
              <MenuItem icon={ImagePlus} onClick={async () => { close(); const p = await api.pickPaths({ multiple: false }); if (p?.[0]) await updateItem(item.id, { coverUri: p[0] }); }}>표지 이미지 선택</MenuItem>
              {item.coverUri && <MenuItem icon={ImageMinus} onClick={() => { void updateItem(item.id, { coverUri: null }); close(); }}>표지 제거</MenuItem>}
              {item.bannerUri && <MenuItem icon={ImageMinus} onClick={() => { void updateItem(item.id, { bannerUri: null }); close(); }}>배너 제거</MenuItem>}
              <MenuSep />
              <MenuItem icon={SlidersHorizontal} checked={editProps} onClick={() => { setEditProps(!editProps); close(); }}>속성 편집</MenuItem>
              <MenuSep />
              <MenuItem icon={Trash2} danger onClick={() => { close(); void deleteItem(item.id); }}>휴지통으로 이동</MenuItem>
            </>
          )}
        </Popover>
      </div>

      <div className="flex-1 overflow-y-auto overflow-x-hidden pb-10">
        {/* banner */}
        <div className={cn("relative", banner ? "h-40" : "h-5")}>
          {banner && (
            <>
              <img src={banner} alt="" className="h-full w-full object-cover" referrerPolicy="no-referrer" />
              <div className="absolute inset-0 bg-gradient-to-t from-surface via-surface/20 to-transparent" />
            </>
          )}
        </div>

        <div className={cn("relative flex gap-4 px-7", banner && "-mt-16", full && "mx-auto w-full max-w-3xl")}>
          {main?.kind !== "image" && <CoverPicker item={item} className={cn("shrink-0 rounded-lg shadow-pop ring-1 ring-line/60", cfg.aspect === "1/1" ? "aspect-square w-28" : cfg.aspect === "16/9" ? "aspect-video w-40" : "aspect-[2/3] w-28")} />}
          <div className="flex min-w-0 flex-1 flex-col pt-1">
            <div className={cn(banner && "pt-10")}><TitleInput item={item} /></div>
            {/* rating right under the title, then the key facts as pills */}
            <div className="mt-1.5"><Stars value={item.rating} size={18} onChange={(rating) => void updateItem(item.id, { rating })} /></div>
            <div className="mt-2.5 flex flex-wrap gap-1.5">
              <Pill icon={K.icon}>{K.label}</Pill>
              {people.map((t) => { const I = TAG_META[t.category].icon; return <Pill key={t.id} icon={I}>{t.name}</Pill>; })}
              {item.year && <Pill icon={CalendarDays}>{item.year}</Pill>}
            </div>
          </div>
        </div>

        <div className={cn("px-7", full && "mx-auto w-full max-w-3xl")}>
          {yt && api.caps.platform === "mock" && (
            <a href={item.url!} target="_blank" rel="noreferrer" className="group relative mt-5 block overflow-hidden rounded-xl bg-black shadow-card">
              <img src={`https://i.ytimg.com/vi/${yt}/hqdefault.jpg`} alt="" className="aspect-video w-full object-cover opacity-80" onError={(e) => (e.currentTarget.style.display = "none")} />
              <div className="absolute inset-0 flex aspect-video items-center justify-center">
                <span className="flex h-12 w-12 items-center justify-center rounded-full bg-red-600 text-white shadow-pop transition-transform group-hover:scale-110"><Play size={20} fill="currentColor" /></span>
              </div>
              <div className="absolute bottom-2 left-3 text-[length:calc(11px*var(--ts))] text-white/80">YouTube에서 재생</div>
            </a>
          )}
          {yt && api.caps.platform !== "mock" && <YouTubePlayer itemId={item.id} videoId={yt} title={item.title} />}
          {/* a song file of the item plays here too (drives synced lyrics) */}
          {item.kind === "music" && song && <AudioPlayer key={song.id} itemId={item.id} file={song} />}

          {main && <MainContent item={item} file={main} />}

          {item.summary && <Summary text={item.summary} />}

          <PropertyList item={item} editing={editProps} onDone={() => setEditProps(false)} />

          <LinksSection item={item} />

          {item.kind === "music" && <LyricsSection item={item} />}

          <div className="mt-6 border-t border-line pt-5"><FileList item={item} /></div>

          <div className="mt-6 border-t border-line pt-5">
            <div className="label mb-2">메모</div>
            {item.blocks ? (
              <BlockEditor key={item.id} itemId={item.id} initial={item.blocks} onChange={(blocks) => void updateItem(item.id, { blocks })} />
            ) : (
              <div className="h-8 animate-pulse rounded-md bg-subtle" />
            )}
          </div>
          {item.source && (
            <div className="mt-6 text-[length:calc(11px*var(--ts))] text-muted">
              정보 출처: {item.source.url ? <a className="underline" href={item.source.url} target="_blank" rel="noreferrer">{item.source.provider}</a> : item.source.provider}
              {item.source.altTitles?.length ? ` · ${item.source.altTitles.slice(0, 3).join(" · ")}` : ""}
            </div>
          )}
        </div>
      </div>
    </aside>
  );
}

function Summary({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="mt-5">
      <p className={cn("whitespace-pre-line text-[length:calc(13px*var(--ts))] leading-relaxed text-fg/80", !open && "line-clamp-4")}>{text}</p>
      {text.length > 160 && <button className="mt-1 text-[length:calc(12px*var(--ts))] text-muted hover:text-fg" onClick={() => setOpen(!open)}>{open ? "접기" : "더보기"}</button>}
    </div>
  );
}

function Pill({ icon: Icon, children }: { icon: LucideIcon; children: React.ReactNode }) {
  return (
    <span className="inline-flex h-7 max-w-full items-center gap-1.5 whitespace-nowrap rounded-full border border-line bg-subtle/60 px-2.5 text-[length:calc(12px*var(--ts))] text-fg/80">
      <Icon size={13} className="shrink-0 text-muted" /><span className="truncate">{children}</span>
    </span>
  );
}

/** Cover with a hover button to replace it: desktop picks a file, browser uploads an image. */
function CoverPicker({ item, className }: { item: Item; className: string }) {
  const update = useApp((s) => s.updateItem);
  const setDialog = useApp((s) => s.setDialog);
  const input = useRef<HTMLInputElement>(null);
  const setFromFile = (f: File) => {
    const img = new Image();
    img.onload = () => {
      const k = Math.min(1, 900 / Math.max(img.width, img.height));
      const c = Object.assign(document.createElement("canvas"), { width: img.width * k, height: img.height * k });
      c.getContext("2d")!.drawImage(img, 0, 0, c.width, c.height);
      void update(item.id, { coverUri: c.toDataURL("image/jpeg", 0.88) });
    };
    img.src = URL.createObjectURL(f);
  };
  const pick = async () => {
    if (!api.caps.localFiles) return input.current?.click();
    const p = await api.pickPaths({ multiple: false });
    if (p?.[0]) void update(item.id, { coverUri: p[0] });
  };
  const video = item.files.find((f) => f.kind === "video");
  const bar = "touch-show absolute inset-x-0 bottom-0 flex h-8 items-center justify-center gap-1 bg-black/55 text-[length:calc(11px*var(--ts))] text-white opacity-0 transition-opacity group-hover/cover:opacity-100";
  return (
    <div className={cn("group/cover relative overflow-hidden", className)}>
      <Cover item={item} className="absolute inset-0" />
      {video ? (
        // videos: choose a moment of the video, or upload a picture
        <Popover width={200} trigger={({ toggle }) => (
          <button onClick={toggle} className={bar}><ImagePlus size={13} />표지 바꾸기</button>
        )}>
          {(close) => (
            <>
              <MenuItem icon={Film} onClick={() => { close(); setDialog({ type: "videoCover", itemId: item.id, fileId: video.id }); }}>영상에서 장면 고르기</MenuItem>
              <MenuItem icon={ImagePlus} onClick={() => { close(); void pick(); }}>이미지 올리기</MenuItem>
            </>
          )}
        </Popover>
      ) : (
        <button onClick={() => void pick()} className={bar}><ImagePlus size={13} />표지 바꾸기</button>
      )}
      <input ref={input} type="file" accept="image/*" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) setFromFile(f); e.target.value = ""; }} />
    </div>
  );
}

function TitleInput({ item }: { item: Item }) {
  const update = useApp((s) => s.updateItem);
  const [v, setV] = useState(item.title);
  useEffect(() => setV(item.title), [item.id, item.title]);
  return (
    <textarea
      value={v}
      rows={2}
      onChange={(e) => setV(e.target.value.replace(/\n/g, ""))}
      onBlur={() => { const t = v.trim() || "제목 없음"; if (t !== item.title) void update(item.id, { title: t }); else setV(item.title); }}
      onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); e.currentTarget.blur(); } }}
      data-title-input
      className="w-full resize-none bg-transparent text-[length:calc(18px*var(--ts))] font-semibold leading-snug outline-none"
    />
  );
}
