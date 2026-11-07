import { BookOpen, Download, ExternalLink, Eye, FilePlus, FolderOpen, FolderPlus, ImageUp, Link2Off, Play } from "lucide-react";
import { useRef } from "react";
import { isReadable } from "@/components/reader/source";
import { isAudio, isText, isVideo } from "@/components/viewer/files";
import { api } from "@/api";
import type { FileRef, Item } from "@/api/types";
import { useApp } from "@/store/app";
import { FILE_META } from "@/lib/meta";
import { bytes } from "@/lib/format";

/** Main action for a file: play (video/audio), view/edit (text), read (pdf/zip/images). */
export function fileAction(f: FileRef) {
  if (isVideo(f) || isAudio(f)) return { icon: Play, label: "재생" };
  if (isText(f)) return { icon: Eye, label: "보기·편집" };
  if (isReadable(f)) return { icon: BookOpen, label: "읽기" };
  return null;
}

export function FileList({ item }: { item: Item }) {
  const { attachPaths, attachBlobs, detachFile, updateItem, openReader } = useApp();
  const input = useRef<HTMLInputElement>(null);
  const desktop = api.caps.localFiles;
  const fail = (e: unknown) => useApp.setState({ error: e instanceof Error ? e.message : String(e) });

  // Any file type: desktop links the original path, the browser uploads the file.
  const addFiles = async () => {
    if (api.attachBlobs) return input.current?.click();
    const p = await api.pickPaths({ multiple: true });
    if (p?.length) await attachPaths(item.id, p);
  };
  const addFolder = async () => {
    const p = await api.pickPaths({ directory: true, multiple: true });
    if (p?.length) await attachPaths(item.id, p);
  };
  const useAsCover = (f: FileRef) => {
    if (desktop) return void updateItem(item.id, { coverUri: f.uri });
    const url = api.fileUrl(f); // browser upload → keep a small data-URL copy as the cover
    if (!url) return;
    const img = new Image();
    img.onload = () => {
      const k = Math.min(1, 800 / img.width);
      const c = Object.assign(document.createElement("canvas"), { width: img.width * k, height: img.height * k });
      c.getContext("2d")!.drawImage(img, 0, 0, c.width, c.height);
      void updateItem(item.id, { coverUri: c.toDataURL("image/jpeg", 0.88) });
    };
    img.src = url;
  };

  return (
    <section>
      <div className="mb-1 flex items-center">
        <div className="label flex-1">파일 · {item.files.length}</div>
        <input ref={input} type="file" multiple hidden onChange={(e) => { void attachBlobs(item.id, [...(e.target.files ?? [])]); e.target.value = ""; }} />
        <button className="btn-icon h-7 w-7" onClick={() => void addFiles()} data-tip="파일 추가 (모든 형식)"><FilePlus size={15} /></button>
        {desktop && <button className="btn-icon h-7 w-7" onClick={() => void addFolder()} data-tip="폴더 연결"><FolderPlus size={15} /></button>}
      </div>
      {item.files.length === 0 && (
        <button onClick={() => void addFiles()} className="w-full truncate whitespace-nowrap rounded-lg border border-dashed border-line px-3 py-4 text-center text-[length:calc(12px*var(--ts))] text-muted hover:bg-subtle">
          파일을 끌어다 놓거나 눌러서 추가
        </button>
      )}
      <div className="space-y-0.5">
        {item.files.map((f) => {
          const Icon = FILE_META[f.kind];
          const act = fileAction(f);
          return (
            <div key={f.id} className="group flex h-9 items-center gap-2 rounded-lg px-1.5 hover:bg-subtle" title={f.uri}>
              <Icon size={16} className="shrink-0 text-muted" />
              <button className="min-w-0 flex-1 truncate text-left hover:underline" onClick={() => openReader(item, f)}>{f.name}</button>
              <span className="touch-hide text-[length:calc(11px*var(--ts))] tabular-nums text-muted group-hover:hidden">{bytes(f.size)}</span>
              <div className="touch-flex hidden items-center group-hover:flex">
                {act && <button className="btn-icon h-7 w-7" onClick={() => openReader(item, f)} data-tip={act.label}><act.icon size={14} /></button>}
                <button className="btn-icon h-7 w-7" onClick={() => void api.downloadFile(f).catch(fail)} data-tip={desktop ? "다른 위치에 저장" : "다운로드"}><Download size={14} /></button>
                {desktop && <button className="btn-icon h-7 w-7" onClick={() => void api.openFile(f)} data-tip="기본 앱으로 열기"><ExternalLink size={14} /></button>}
                {desktop && <button className="btn-icon h-7 w-7" onClick={() => void api.revealFile(f)} data-tip="폴더에서 보기"><FolderOpen size={14} /></button>}
                {f.kind === "image" && <button className="btn-icon h-7 w-7" onClick={() => useAsCover(f)} data-tip="표지로 사용"><ImageUp size={14} /></button>}
                <button className="btn-icon h-7 w-7 hover:text-danger" onClick={() => void detachFile(item.id, f.id)} data-tip="목록에서 빼기 (원본은 그대로)"><Link2Off size={14} /></button>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
