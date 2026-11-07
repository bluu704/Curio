import { Link2, Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import { api } from "@/api";
import type { Kind } from "@/api/types";
import { KINDS } from "@/api/types";
import { activeView, useApp, viewContext } from "@/store/app";
import { KIND_CONFIG } from "@/lib/kinds";
import { Modal } from "@/components/ui/Modal";
import { kindFromLink } from "@/lib/links";
export { kindFromLink };

/** Paste a link (or exact title) → create the item and fill it from the web. */
export function LinkDialog() {
  const s = useApp();
  const ctx = viewContext(activeView(s));
  const [text, setText] = useState("");
  const [kind, setKind] = useState<Kind>(ctx.kind ?? "music");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const open = s.dialog?.type === "link";
  useEffect(() => { if (open) { setKind(ctx.kind && ctx.kind !== "doujin" ? ctx.kind : "anime"); setErr(null); } }, [open, ctx.kind]);
  if (!open) return null;

  // A YouTube link in a movie/anime/기타 archive is a video, not a song.
  const raw = kindFromLink(text);
  const detected = raw === "music" && ctx.kind && ["movie", "anime", "other", "drama"].includes(ctx.kind) ? ctx.kind : raw;
  const k = detected ?? kind;
  const v = text.trim();
  const isUrl = /^https?:\/\//i.test(v);
  const looksLikeLink = !isUrl && /^[\w-]+(\.[\w-]+)+(\/\S*)?$/.test(v); // "example.com/…" without scheme

  const submit = async () => {
    if (!v) return;
    if (looksLikeLink) return setErr("지원하지 않는 링크입니다");
    setBusy(true);
    setErr(null);
    try {
      if (isUrl) {
        // links: only create the item when a source recognised it
        const hits = await api.searchMetadata(k, v).catch(() => []);
        if (!hits.length) { setErr("지원하지 않는 링크입니다"); return; }
        const it = await s.createItem({ title: hits[0].title || "제목 없음", kind: k, list: ctx.list, url: v });
        await s.applyMetadata(it.id, hits[0], true);
        s.setDialog(null);
      } else {
        const it = await s.createItem({ title: v, kind: k, list: ctx.list });
        const ok = await s.autofill([it.id]);
        s.setDialog(ok ? null : { type: "metadata", itemId: it.id });
      }
      setText("");
    } finally { setBusy(false); }
  };

  return (
    <Modal open onClose={() => s.setDialog(null)} title="링크·제목으로 추가" width={560}>
      <div className="space-y-3">
        <div>
          <div className="relative">
            <Link2 size={15} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted" />
            <input autoFocus className="input h-10 pl-8" value={text} onChange={(e) => { setText(e.target.value); setErr(null); }} onKeyDown={(e) => e.key === "Enter" && void submit()}
              placeholder="주소 또는 정확한 제목" />
          </div>
          {err && <div className="mt-1 text-[length:calc(11px*var(--ts))] text-danger">{err}</div>}
        </div>
        <div className="flex items-center gap-2 text-[length:calc(12px*var(--ts))] text-muted">
          <span>종류</span>
          {detected ? (
            <span className="chip">{KIND_CONFIG[detected].label}</span>
          ) : (
            <select className="input h-7 w-36" value={kind} onChange={(e) => setKind(e.target.value as Kind)}>
              {KINDS.filter((x) => x !== "doujin").map((x) => <option key={x} value={x}>{KIND_CONFIG[x].label}</option>)}
            </select>
          )}
          <span className="ml-auto">{ctx.list === "wishlist" ? "위시리스트에 추가" : "아카이브에 추가"}</span>
        </div>
        <div className="flex justify-end">
          <button className="btn btn-primary" disabled={busy || !v} onClick={() => void submit()}>
            {busy && <Loader2 size={15} className="animate-spin" />}추가
          </button>
        </div>
      </div>
    </Modal>
  );
}
