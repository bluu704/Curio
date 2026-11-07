import { Link2, Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import type { Kind } from "@/api/types";
import { KINDS } from "@/api/types";
import { activeView, useApp, viewContext } from "@/store/app";
import { KIND_CONFIG } from "@/lib/kinds";
import { Modal } from "@/components/ui/Modal";

/** Kind implied by a link (YouTube → 노래, Steam/Play → 게임, 네이버 웹툰 → 웹툰). */
export function kindFromLink(s: string): Kind | null {
  if (/youtu\.?be|music\.youtube/i.test(s)) return "music";
  if (/steampowered\.com|play\.google\.com|onstove\.com/i.test(s)) return "game";
  if (/comic\.naver\.com|webtoon/i.test(s)) return "webtoon";
  if (/series\.naver\.com|page\.kakao|ridibooks|novelpia|munpia/i.test(s)) return "web_novel";
  if (/anilist\.co\/anime|laftel|myanimelist\.net\/anime/i.test(s)) return "anime";
  return null;
}

/** Paste a link (or exact title) → create the item and fill it from the web. */
export function LinkDialog() {
  const s = useApp();
  const ctx = viewContext(activeView(s));
  const [text, setText] = useState("");
  const [kind, setKind] = useState<Kind>(ctx.kind ?? "music");
  const [busy, setBusy] = useState(false);
  const open = s.dialog?.type === "link";
  // Default kind = the archive you are looking at, every time the dialog opens.
  useEffect(() => { if (open) setKind(ctx.kind && ctx.kind !== "doujin" ? ctx.kind : "anime"); }, [open, ctx.kind]);
  if (!open) return null;

  // A YouTube link in a movie/anime/기타 archive is a video, not a song.
  const raw = kindFromLink(text);
  const detected = raw === "music" && ctx.kind && ["movie", "anime", "other"].includes(ctx.kind) ? ctx.kind : raw;
  const k = detected ?? kind;
  const isUrl = /^https?:\/\//i.test(text.trim());

  const submit = async () => {
    const v = text.trim();
    if (!v) return;
    setBusy(true);
    try {
      const it = await s.createItem({ title: isUrl ? "제목 없음" : v, kind: k, list: ctx.list, url: isUrl ? v : null });
      const ok = await s.autofill([it.id]);
      s.setDialog(ok ? null : { type: "metadata", itemId: it.id });
      setText("");
    } finally { setBusy(false); }
  };

  return (
    <Modal open onClose={() => s.setDialog(null)} title="링크·제목으로 추가" width={560}>
      <div className="space-y-3">
        <div className="relative">
          <Link2 size={15} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted" />
          <input autoFocus className="input h-10 pl-8" value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => e.key === "Enter" && void submit()}
            placeholder="YouTube·YouTube Music·Steam·Google Play 주소 또는 정확한 제목" />
        </div>
        <div className="flex items-center gap-2 text-[length:calc(12px*var(--ts))] text-muted">
          <span>종류</span>
          {detected ? (
            <span className="chip">{KIND_CONFIG[detected].label} (주소에서 자동 인식)</span>
          ) : (
            <select className="input h-7 w-36" value={kind} onChange={(e) => setKind(e.target.value as Kind)}>
              {KINDS.filter((x) => x !== "doujin").map((x) => <option key={x} value={x}>{KIND_CONFIG[x].label}</option>)}
            </select>
          )}
          <span className="ml-auto">{ctx.list === "wishlist" ? "위시리스트에 추가" : "아카이브에 추가"}</span>
        </div>
        <p className="text-[length:calc(12px*var(--ts))] leading-relaxed text-muted">
          노래는 YouTube·YouTube Music 주소나 곡명, 영상은 YouTube 주소나 제목, 웹툰은 네이버 웹툰 주소, 게임은 Steam·Google Play 주소만 넣어도 표지·썸네일까지 가져와요. 결과가 확실하지 않으면 후보 목록을 보여드려요.
        </p>
        <div className="flex justify-end">
          <button className="btn btn-primary" disabled={busy || !text.trim()} onClick={() => void submit()}>
            {busy && <Loader2 size={15} className="animate-spin" />}추가
          </button>
        </div>
      </div>
    </Modal>
  );
}
