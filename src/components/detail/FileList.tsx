import { BookOpen, ExternalLink, FilePlus, FileUp, FolderOpen, FolderPlus, ImageUp, Link2Off } from "lucide-react";
import { useRef } from "react";
import { isReadable } from "@/components/reader/source";
import { api } from "@/api";
import type { Item } from "@/api/types";
import { useApp } from "@/store/app";
import { FILE_META } from "@/lib/meta";
import { bytes } from "@/lib/format";

export function FileList({ item }: { item: Item }) {
  const { attachPaths, attachBlobs, detachFile, updateItem, openReader } = useApp();
  const input = useRef<HTMLInputElement>(null);
  const canUpload = !!api.attachBlobs;
  const pick = async (directory: boolean) => {
    const p = await api.pickPaths({ directory, multiple: true });
    if (p?.length) await attachPaths(item.id, p);
  };
  return (
    <section>
      <div className="mb-1 flex items-center">
        <div className="label flex-1">연결된 파일 · {item.files.length}</div>
        {canUpload && (
          <>
            <input ref={input} type="file" multiple hidden accept=".pdf,.zip,.cbz,image/*" onChange={(e) => { void attachBlobs(item.id, [...(e.target.files ?? [])]); e.target.value = ""; }} />
            <button className="btn-icon h-7 w-7" onClick={() => input.current?.click()} data-tip="파일 올리기 (PDF·ZIP·이미지)"><FileUp size={15} /></button>
          </>
        )}
        <button className="btn-icon h-7 w-7" onClick={() => void pick(false)} data-tip="파일 연결"><FilePlus size={15} /></button>
        <button className="btn-icon h-7 w-7" onClick={() => void pick(true)} data-tip="폴더 연결"><FolderPlus size={15} /></button>
      </div>
      {item.files.length === 0 && (
        <div className="rounded-lg border border-dashed border-line px-3 py-4 text-center text-[length:calc(12px*var(--ts))] text-muted">
          {item.kind === "doujin" ? "PDF나 ZIP을 올리면 바로 읽을 수 있어요" : "원본은 그대로 두고 경로만 연결해요"}
        </div>
      )}
      <div className="space-y-0.5">
        {item.files.map((f) => {
          const Icon = FILE_META[f.kind];
          return (
            <div key={f.id} className="group flex h-9 items-center gap-2 rounded-lg px-1.5 hover:bg-subtle" title={f.uri}>
              <Icon size={16} className="shrink-0 text-muted" />
              <span className="min-w-0 flex-1 truncate">{f.name}</span>
              <span className="text-[length:calc(11px*var(--ts))] tabular-nums text-muted group-hover:hidden touch-hide">{bytes(f.size)}</span>
              <div className="touch-flex hidden items-center group-hover:flex">
                {isReadable(f) && <button className="btn-icon h-7 w-7" onClick={() => openReader(item, f)} data-tip="뷰어로 읽기"><BookOpen size={14} /></button>}
                <button className="btn-icon h-7 w-7" onClick={() => void api.openFile(f)} data-tip="기본 앱으로 열기"><ExternalLink size={14} /></button>
                <button className="btn-icon h-7 w-7" onClick={() => void api.revealFile(f)} data-tip="폴더에서 보기"><FolderOpen size={14} /></button>
                {f.kind === "image" && (
                  <button className="btn-icon h-7 w-7" onClick={() => void updateItem(item.id, { coverUri: f.uri })} data-tip="표지로 사용"><ImageUp size={14} /></button>
                )}
                <button className="btn-icon h-7 w-7 hover:text-danger" onClick={() => void detachFile(item.id, f.id)} data-tip="연결 해제"><Link2Off size={14} /></button>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
