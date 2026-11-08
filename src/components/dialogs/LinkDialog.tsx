import { Link2, Loader2 } from "lucide-react";
import { Select } from "@/components/ui/Select";
import { iconOf } from "@/lib/icons";
import { useEffect, useState } from "react";
import { api } from "@/api";
import { activeView, useApp, viewContext } from "@/store/app";
import { Modal } from "@/components/ui/Modal";
import { kindFromLink } from "@/lib/links";
export { kindFromLink };

/** Paste a link (or exact title) → create the item and fill it from the web. */
export function LinkDialog() {
  const s = useApp();
  const ctx = viewContext(activeView(s));
  const [text, setText] = useState("");
  const archives = s.archives.filter((a) => a.kind !== "doujin");
  const [arcId, setArcId] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const open = s.dialog?.type === "link";
  const [picked, setPicked] = useState(false); // user chose an archive by hand → stop auto-switching
  useEffect(() => {
    if (!open) return;
    setArcId(archives.find((a) => a.id === ctx.archiveId)?.id ?? archives[0]?.id ?? "");
    setPicked(false);
    setErr(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, ctx.archiveId]);
  // A recognised link picks the matching archive (YouTube → 노래, X → 일러스트…) unless the
  // current archive already accepts it (a YouTube link in 애니/영화 is a video).
  const raw = kindFromLink(text);
  const cur = archives.find((a) => a.id === arcId);
  useEffect(() => {
    if (!open || picked || !raw || !cur || cur.kind === raw) return;
    if (raw === "music" && /youtu/i.test(text) && ["movie", "anime", "other", "drama"].includes(cur.kind)) return;
    const m = archives.find((a) => a.kind === raw);
    if (m) setArcId(m.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [raw, open, picked]);
  if (!open) return null;

  const k = cur?.kind ?? raw ?? "other";
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
        const it = await s.createItem({ title: hits[0].title || "제목 없음", kind: k, archiveId: cur?.id, list: ctx.list, url: v });
        await s.applyMetadata(it.id, hits[0], true);
        s.setDialog(null);
      } else {
        const it = await s.createItem({ title: v, kind: k, archiveId: cur?.id, list: ctx.list });
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
          <Select className="h-7 w-40" value={arcId} onChange={(v) => { setArcId(v); setPicked(true); }} options={archives.map((a) => ({ value: a.id, label: a.name, icon: iconOf(a.icon) }))} />
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
