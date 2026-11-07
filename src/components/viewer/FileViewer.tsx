import { Download, Eye, Loader2, Pencil, Save, X } from "lucide-react";
import { useEffect, useState } from "react";
import { api } from "@/api";
import { useApp } from "@/store/app";
import { cn } from "@/lib/cn";
import { Cover } from "@/components/ui/Cover";
import { MarkdownView } from "./MarkdownView";
import { isAudio, isMarkdown, isText, isVideo } from "./files";

/** Full-screen viewer for video, audio and text/markdown files (text can be edited and saved back). */
export function FileViewer() {
  const v = useApp((s) => s.viewer);
  const close = () => useApp.setState({ viewer: null });
  useEffect(() => {
    if (!v) return;
    const k = (e: KeyboardEvent) => e.key === "Escape" && !(e.target as HTMLElement).closest("textarea") && close();
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [v]);
  if (!v) return null;
  const { item, file } = v;
  const url = isText(file) ? null : api.fileUrl(file);
  return (
    <div className="anim-fade fixed inset-0 z-[80] flex flex-col bg-bg">
      <div className="flex h-12 shrink-0 items-center gap-2 border-b border-line px-3">
        <button className="btn-icon" onClick={close} data-tip="닫기 (Esc)"><X size={18} /></button>
        <div className="min-w-0 flex-1 truncate font-medium">{item.title} <span className="text-muted">· {file.name}</span></div>
        <button className="btn-icon" onClick={() => void api.downloadFile(file).catch((e) => useApp.setState({ error: String(e) }))} data-tip="다운로드"><Download size={16} /></button>
      </div>
      {isText(file) ? (
        <TextPane key={file.id} />
      ) : !url ? (
        <div className="m-auto text-muted">파일을 열 수 없어요</div>
      ) : isVideo(file) ? (
        <div className="flex min-h-0 flex-1 items-center justify-center bg-black">
          <video src={url} controls autoPlay playsInline className="max-h-full max-w-full" />
        </div>
      ) : isAudio(file) ? (
        <div className="m-auto flex w-full max-w-md flex-col items-center gap-5 p-6">
          <Cover item={item} className="aspect-square w-64 max-w-full rounded-2xl shadow-pop" iconSize={48} />
          <div className="text-center">
            <div className="text-[length:calc(17px*var(--ts))] font-semibold">{item.title}</div>
            <div className="text-muted">{item.tags.filter((t) => t.category === "author").map((t) => t.name).join(", ")}</div>
          </div>
          <audio src={url} controls autoPlay className="w-full" />
        </div>
      ) : null}
    </div>
  );
}

function TextPane() {
  const file = useApp((s) => s.viewer!.file);
  const [text, setText] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [edit, setEdit] = useState(false);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    api.readText(file).then((t) => { setText(t); setDraft(t); }).catch((e) => setErr(e instanceof Error ? e.message : String(e)));
  }, [file]);
  const dirty = text !== null && draft !== text;
  const save = async () => {
    setSaving(true);
    try { await api.writeText(file, draft); setText(draft); useApp.getState().notify("저장했어요"); }
    catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
    finally { setSaving(false); }
  };
  if (err) return <div className="m-auto max-w-md text-center text-danger">{err}</div>;
  if (text === null) return <Loader2 className="m-auto animate-spin text-muted" />;
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex shrink-0 items-center gap-2 border-b border-line px-4 py-2">
        <div className="inline-flex rounded-lg bg-subtle p-0.5">
          <button className={cn("flex h-7 items-center gap-1.5 whitespace-nowrap rounded-md px-2.5", !edit ? "bg-surface shadow-card" : "text-muted")} onClick={() => setEdit(false)}><Eye size={14} />보기</button>
          <button className={cn("flex h-7 items-center gap-1.5 whitespace-nowrap rounded-md px-2.5", edit ? "bg-surface shadow-card" : "text-muted")} onClick={() => setEdit(true)}><Pencil size={14} />편집</button>
        </div>
        <div className="flex-1" />
        {dirty && <span className="text-[length:calc(12px*var(--ts))] text-muted">저장 안 됨</span>}
        <button className="btn btn-primary h-8" disabled={!dirty || saving} onClick={() => void save()}>{saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}저장</button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {edit ? (
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") { e.preventDefault(); void save(); } }}
            spellCheck={false}
            className="mx-auto block h-full min-h-[60vh] w-full max-w-3xl resize-none bg-transparent p-6 font-sans text-[length:calc(14px*var(--ts))] leading-relaxed outline-none"
          />
        ) : (
          <div className="mx-auto max-w-3xl p-6">
            {isMarkdown(file) ? <MarkdownView text={draft} /> : <div className="whitespace-pre-wrap break-words font-sans text-[length:calc(14px*var(--ts))] leading-relaxed">{draft}</div>}
          </div>
        )}
      </div>
    </div>
  );
}
