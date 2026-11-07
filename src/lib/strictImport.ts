import type { Kind, ListKind, NewItem, NewTag, Status, TagCategory } from "@/api/types";
import { KIND_CONFIG } from "./kinds";
import { DEFAULT_STATUSES } from "./statuses";
import { useApp } from "@/store/app";

/**
 * Fixed-format paste import. One item per line, columns in this exact order,
 * separated by "|" or Tab (copying cells from Excel / Google Sheets gives tabs):
 *
 *   제목 | 상태 | 평점 | 작가 | 장르 | 태그 | 링크 | 메모
 *
 * - Only 제목 is required. Trailing columns may be omitted; empty cells are fine.
 * - 상태: one of the user's status labels, spaces ignored (기본: 볼예정 · 감상중 · 완료 · 보류 · 중단) or empty
 * - 평점: 0–5 in 0.5 steps (e.g. 4.5) or empty
 * - 작가 · 장르 · 태그: several values separated by ","
 * - 링크: http(s) URL — or a product code (품번) for the 품번 archive
 * - Lines starting with "#" are comments. A header line identical to the template is skipped.
 * Write titles exactly as they are officially written: auto-fill searches by title.
 */

export const COLUMNS = ["제목", "상태", "평점", "작가", "장르", "태그", "링크", "메모"] as const;
export const TEMPLATE = COLUMNS.join(" | ");

/** Status words = the user's status labels without spaces (e.g. "볼 예정" → "볼예정"). */
export const statusWords = (): Record<string, Status> =>
  Object.fromEntries((useApp.getState().statuses.length ? useApp.getState().statuses : DEFAULT_STATUSES).map((d) => [d.label.replace(/\s/g, ""), d.id]));

export interface StrictRow {
  line: number;
  raw: string;
  item: NewItem | null;
  errors: string[];
}

export function parseStrict(text: string, kind: Kind, list: ListKind): StrictRow[] {
  const authorCat: TagCategory = KIND_CONFIG[kind].tagCats[0][0];
  const out: StrictRow[] = [];
  text.replace(/\r\n?/g, "\n").split("\n").forEach((raw, i) => {
    const line = raw.trim();
    if (!line || line.startsWith("#")) return;
    const cells = (raw.includes("\t") ? raw.split("\t") : raw.split("|")).map((c) => c.trim());
    if (cells[0] === "제목" && cells[1] === "상태") return; // header
    const [title, status, rating, author, genre, tag, link, memo] = cells;
    const errors: string[] = [];

    if (!title) errors.push("제목이 비어 있어요");
    if (cells.length > COLUMNS.length) errors.push(`칸이 ${cells.length}개예요 (최대 ${COLUMNS.length}개) — 제목 안에 "|"가 있으면 Tab으로 구분하세요`);

    let st: Status | undefined;
    if (status) {
      const words = statusWords();
      st = words[status.replace(/\s/g, "")];
      if (!st) errors.push(`상태 "${status}" — ${Object.keys(words).join(" · ")} 중 하나로 써 주세요`);
    }

    let r: number | null = null;
    if (rating) {
      const n = Number(rating);
      if (!Number.isFinite(n) || n < 0 || n > 5 || Math.round(n * 2) !== n * 2) errors.push(`평점 "${rating}" — 0~5 사이, 0.5 단위 숫자로 써 주세요`);
      else r = n;
    }

    let url: string | null = null;
    let code: string | null = null;
    if (link) {
      if (/^https?:\/\//i.test(link)) url = link;
      else if (kind === "catalog" || kind === "doujin") code = link;
      else errors.push(`링크 "${link}" — http:// 또는 https:// 로 시작해야 해요`);
    }

    const split = (v: string | undefined, category: TagCategory): NewTag[] =>
      (v ?? "").split(",").map((x) => x.trim()).filter(Boolean).map((name) => ({ name, category }));

    out.push({
      line: i + 1,
      raw,
      errors,
      item: errors.length
        ? null
        : {
            title: title!,
            kind,
            list,
            status: st ?? (list === "wishlist" ? "planned" : undefined),
            rating: r,
            url,
            code,
            summary: memo || null,
            tags: [...split(author, authorCat), ...split(genre, "genre"), ...split(tag, "tag")],
          },
    });
  });
  return out;
}
