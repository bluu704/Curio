import {
  AtSign, Bookmark as BookmarkIcon, CalendarDays, CalendarRange, ChevronsRightLeft, Clapperboard, Code2, Image as ImageIcon, ListTree, Heading1, Heading2, Heading3, Lightbulb, Link, List, ListOrdered, Minus, Pilcrow, Sigma,
  SquareCheck, Table, TextQuote, type LucideIcon,
} from "lucide-react";
import { useEffect, useState } from "react";
import { api } from "@/api";
import type { BlockType, Item } from "@/api/types";
import { cn } from "@/lib/cn";
import { Cover } from "@/components/ui/Cover";

export type SlashCommand =
  | { id: string; label: string; icon: LucideIcon; keys: string; kind: "type"; type: BlockType; data?: Record<string, unknown> }
  | { id: string; label: string; icon: LucideIcon; keys: string; kind: "link" | "mention" | "date" };

/** Notion-style "/" commands. `keys` = extra search words (Korean + English). */
export const COMMANDS: SlashCommand[] = [
  { id: "text", label: "텍스트", icon: Pilcrow, keys: "text paragraph 본문", kind: "type", type: "paragraph" },
  { id: "h1", label: "제목 1", icon: Heading1, keys: "h1 heading title 큰제목", kind: "type", type: "h1" },
  { id: "h2", label: "제목 2", icon: Heading2, keys: "h2 heading 중제목", kind: "type", type: "heading" },
  { id: "h3", label: "제목 3", icon: Heading3, keys: "h3 heading 소제목", kind: "type", type: "h3" },
  { id: "todo", label: "체크박스", icon: SquareCheck, keys: "todo check 할일 할 일 체크", kind: "type", type: "todo" },
  { id: "bullet", label: "글머리 목록", icon: List, keys: "bullet list 불렛 목록 리스트", kind: "type", type: "bullet" },
  { id: "numbered", label: "번호 목록", icon: ListOrdered, keys: "number ordered 번호 숫자", kind: "type", type: "numbered" },
  { id: "table", label: "표", icon: Table, keys: "table 테이블 표", kind: "type", type: "table" },
  { id: "quote", label: "인용", icon: TextQuote, keys: "quote 인용구", kind: "type", type: "quote" },
  { id: "callout", label: "콜아웃", icon: Lightbulb, keys: "callout 강조 메모 박스", kind: "type", type: "callout" },
  { id: "code", label: "코드", icon: Code2, keys: "code 코드블록", kind: "type", type: "code" },
  { id: "math", label: "수식", icon: Sigma, keys: "math latex tex 수학 공식", kind: "type", type: "math" },
  { id: "divider", label: "구분선", icon: Minus, keys: "divider line hr 줄 선", kind: "type", type: "divider" },
  { id: "toggle", label: "토글", icon: ChevronsRightLeft, keys: "toggle 접기 펼치기 숨기기", kind: "type", type: "toggle" },
  { id: "toggle1", label: "토글 제목 1", icon: Heading1, keys: "toggle heading 토글제목 접는 제목", kind: "type", type: "toggle", data: { level: 1 } },
  { id: "toggle2", label: "토글 제목 2", icon: Heading2, keys: "toggle heading 토글제목 접는 제목", kind: "type", type: "toggle", data: { level: 2 } },
  { id: "toggle3", label: "토글 제목 3", icon: Heading3, keys: "toggle heading 토글제목 접는 제목", kind: "type", type: "toggle", data: { level: 3 } },
  { id: "image", label: "이미지", icon: ImageIcon, keys: "image picture 사진 그림 이미지", kind: "type", type: "image" },
  { id: "video", label: "동영상", icon: Clapperboard, keys: "video youtube 유튜브 영상 동영상", kind: "type", type: "video" },
  { id: "bookmark", label: "북마크", icon: BookmarkIcon, keys: "bookmark 북마크 웹 사이트 카드", kind: "type", type: "bookmark" },
  { id: "calendar", label: "달력", icon: CalendarRange, keys: "calendar 달력 캘린더 일정 월간", kind: "type", type: "calendar" },
  { id: "toc", label: "목차", icon: ListTree, keys: "toc contents 목차 차례", kind: "type", type: "toc" },
  { id: "link", label: "링크", icon: Link, keys: "link url 주소 하이퍼링크", kind: "link" },
  { id: "mention", label: "다른 항목 연결", icon: AtSign, keys: "mention item 항목 연결 멘션 페이지", kind: "mention" },
  { id: "date", label: "날짜", icon: CalendarDays, keys: "date today 날짜 오늘 일자", kind: "date" },
];

export const matchCommands = (q: string) => {
  const s = q.trim().toLowerCase();
  return s ? COMMANDS.filter((c) => (c.label + " " + c.keys).toLowerCase().includes(s)) : COMMANDS;
};

/** The floating list under the block. `mode = "items"` shows the item picker for mentions. */
export function SlashMenu({ query, sel, mode, onPick, onPickItem, onHover }: {
  query: string; sel: number; mode: "commands" | "items";
  onPick: (c: SlashCommand) => void; onPickItem: (it: Item) => void; onHover: (i: number) => void;
}) {
  const [items, setItems] = useState<Item[]>([]);
  useEffect(() => {
    if (mode !== "items") return;
    const t = setTimeout(() => void api.listItems({ search: query || undefined }).then((r) => setItems(r.slice(0, 8))), 120);
    return () => clearTimeout(t);
  }, [mode, query]);
  const list = matchCommands(query);
  return (
    <div className="popover anim-pop absolute left-0 top-full z-40 mt-1 max-h-72 w-64 overflow-y-auto" onMouseDown={(e) => e.preventDefault()}>
      {mode === "commands" ? (
        list.length ? list.map((c, i) => (
          <button key={c.id} onMouseEnter={() => onHover(i)} onClick={() => onPick(c)}
            className={cn("menu-item", i === sel && "bg-subtle")}>
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-line bg-surface"><c.icon size={15} /></span>
            <span className="flex-1">{c.label}</span>
          </button>
        )) : <div className="px-2 py-2 text-[length:calc(12px*var(--ts))] text-muted">일치하는 명령이 없어요</div>
      ) : (
        <>
          <div className="label px-2 pb-1 pt-1.5">연결할 항목 {query && `· "${query}"`}</div>
          {items.map((it, i) => (
            <button key={it.id} onMouseEnter={() => onHover(i)} onClick={() => onPickItem(it)} className={cn("menu-item h-10", i === sel && "bg-subtle")}>
              <Cover item={it} className="h-8 w-6 shrink-0 rounded" iconSize={11} />
              <span className="flex-1 truncate">{it.title}</span>
            </button>
          ))}
          {!items.length && <div className="px-2 py-2 text-[length:calc(12px*var(--ts))] text-muted">제목을 입력해 찾으세요</div>}
        </>
      )}
    </div>
  );
}

export const pickedItem = (items: Item[], sel: number) => items[sel];
