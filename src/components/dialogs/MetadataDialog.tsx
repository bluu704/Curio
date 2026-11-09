import { Check, Loader2, Search } from "lucide-react";
import { useEffect, useState } from "react";
import { api } from "@/api";
import type { Candidate, Kind } from "@/api/types";
import { useApp } from "@/store/app";
import { isSong } from "@/lib/itemFlags";
import { TAG_META } from "@/lib/meta";
import { cn } from "@/lib/cn";
import { Modal } from "@/components/ui/Modal";

export const PROVIDER_LABEL: Record<string, string> = {
  anilist: "AniList", steam: "Steam", googleplay: "Google Play", naver: "네이버", wikipedia: "위키백과", youtube: "YouTube", deezer: "Deezer",
  "youtube-video": "YouTube", kitsu: "Kitsu", tvmaze: "TVmaze", openlibrary: "Open Library", googlebooks: "Google 도서", vndb: "VNDB", pixiv: "pixiv", web: "웹",
  x: "X", "youtube-post": "YouTube 게시물", spotify: "Spotify", soundcloud: "SoundCloud",
};

/** Search several sources at once and apply one hit (cover/banner downloaded, people → tags). */
export function MetadataDialog() {
  const { dialog, setDialog, items, detail, applyMetadata } = useApp();
  const open = dialog?.type === "metadata";
  const item = open ? (detail?.id === dialog.itemId ? detail : items.find((i) => i.id === dialog.itemId)) : undefined;
  const [kind, setKind] = useState<Kind>("anime");
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<Candidate[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [overwrite, setOverwrite] = useState(true);

  const run = async (k = kind, query = q) => {
    if (!query.trim()) return;
    setBusy("search"); setErr(null); setHits(null);
    try { setHits(await api.searchMetadata(k, query)); }
    catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(null); }
  };

  useEffect(() => {
    if (!open || !item) return;
    const query = item.url ?? (item.title === "제목 없음" ? "" : item.title);
    const k = isSong(item, useApp.getState().archives.find((a) => a.id === item.archiveId)?.name) ? "music" : "other";
    setKind(k); setQ(query); setHits(null); setErr(null); setOverwrite(true); // the found title replaces the typed one unless unticked
    if (query) void run(k, query);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, item?.id]);

  if (!open || !item) return null;
  const apply = async (c: Candidate) => {
    setBusy(c.provider + c.id);
    try { await applyMetadata(item.id, c, overwrite); setDialog(null); }
    catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(null); }
  };

  return (
    <Modal open onClose={() => setDialog(null)} title="정보 자동 검색" width={720}>
      <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); void run(); }}>
        <input autoFocus className="input flex-1" value={q} onChange={(e) => setQ(e.target.value)} placeholder="제목 또는 주소" />
        <button className="btn btn-primary" disabled={busy === "search"}>{busy === "search" ? <Loader2 size={15} className="animate-spin" /> : <Search size={15} />}검색</button>
      </form>
      <div className="mt-2 flex items-center justify-between text-[length:calc(12px*var(--ts))] text-muted">
        <span />
        <label className="flex cursor-pointer items-center gap-1.5">
          <input type="checkbox" checked={overwrite} onChange={(e) => setOverwrite(e.target.checked)} className="accent-[rgb(var(--accent))]" />제목도 바꾸기
        </label>
      </div>

      {err && <div className="mt-3 rounded-lg bg-danger/10 px-3 py-2 text-[length:calc(12px*var(--ts))] text-danger">{err}</div>}
      {hits && !hits.length && <div className="mt-6 text-center text-[length:calc(13px*var(--ts))] text-muted">결과가 없어요</div>}

      <div className="mt-3 space-y-1.5">
        {hits?.map((c) => (
          <button key={c.provider + c.id} disabled={!!busy} onClick={() => void apply(c)}
            className="group flex w-full gap-3 rounded-xl border border-line p-2 text-left transition-colors hover:border-accent/50 hover:bg-subtle disabled:opacity-60">
            <div className="h-24 w-16 shrink-0 overflow-hidden rounded-md bg-subtle">
              {c.coverUrl && <img src={c.coverUrl} alt="" referrerPolicy="no-referrer" className="h-full w-full object-cover" loading="lazy" />}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="truncate font-medium">{c.title}</span>
                {c.year && <span className="text-[length:calc(12px*var(--ts))] text-muted">{c.year}</span>}
                <span className="ml-auto shrink-0 rounded-md bg-subtle px-1.5 py-0.5 text-[length:calc(10px*var(--ts))] font-semibold text-muted">{PROVIDER_LABEL[c.provider] ?? c.provider}</span>
              </div>
              {c.detail && <div className="text-[length:calc(12px*var(--ts))] font-medium text-accent">{c.detail}</div>}
              {c.altTitles.length > 0 && <div className="truncate text-[length:calc(12px*var(--ts))] text-muted">{c.altTitles.slice(0, 3).join(" · ")}</div>}
              <div className="mt-1 flex flex-wrap gap-1">
                {c.people.slice(0, 5).map((p) => {
                  const I = TAG_META[p.category].icon;
                  return <span key={p.category + p.name} className="chip h-5 text-[length:calc(11px*var(--ts))]"><I size={10} className="opacity-60" />{p.name}</span>;
                })}
                {c.genres.slice(0, 3).map((g) => <span key={g} className="chip h-5 text-[length:calc(11px*var(--ts))] text-muted">{g}</span>)}
              </div>
              {c.summary && <div className="mt-1 line-clamp-2 text-[length:calc(12px*var(--ts))] text-muted">{c.summary}</div>}
            </div>
            <div className={cn("flex w-8 items-center justify-center text-accent", busy === c.provider + c.id ? "" : "opacity-0 group-hover:opacity-100")}>
              {busy === c.provider + c.id ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}
            </div>
          </button>
        ))}
      </div>
    </Modal>
  );
}
