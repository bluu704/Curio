import { CircleAlert, CircleCheck, X } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Upload } from "lucide-react";
import { activeView, useApp } from "@/store/app";
import { Sidebar } from "@/components/layout/Sidebar";
import { Toolbar } from "@/components/layout/Toolbar";
import { GalleryView } from "@/components/views/GalleryView";
import { MasonryView } from "@/components/views/MasonryView";
import { TableView } from "@/components/views/TableView";
import { ListView } from "@/components/views/ListView";
import { EmptyState } from "@/components/views/shared";
import { ScrollCtx } from "@/components/views/virtual";
import { CategoryTree } from "@/components/categories/CategoryTree";
import { DragGhost } from "@/components/categories/DragGhost";
import { DetailPanel } from "@/components/detail/DetailPanel";
import { ContextMenu } from "@/components/menus/ContextMenu";
import { ArchiveDialog } from "@/components/dialogs/ArchiveDialog";
import { SettingsModal } from "@/components/settings/SettingsModal";
import { MetadataDialog } from "@/components/dialogs/MetadataDialog";
import { BulkBar } from "@/components/views/BulkBar";
import { VideoCoverDialog } from "@/components/dialogs/VideoCoverDialog";
import { LinkDialog } from "@/components/dialogs/LinkDialog";
import { ImportDialog } from "@/components/dialogs/ImportDialog";
import { Reader } from "@/components/reader/Reader";
import { FileViewer } from "@/components/viewer/FileViewer";
import { TooltipLayer } from "@/components/ui/TooltipLayer";
import { useFileDrop } from "@/hooks/useFileDrop";
import { TrashView } from "@/components/views/TrashView";
import { CalendarPage } from "@/components/views/CalendarPage";
import { useShortcuts } from "@/hooks/useShortcuts";

export default function App() {
  const s = useApp();
  const view = activeView(s);
  const [scrollEl, setScrollEl] = useState<HTMLDivElement | null>(null);

  useEffect(() => { void useApp.getState().init(); }, []);
  useShortcuts();

  // Ctrl+N and the other shortcuts live in useShortcuts (user-rebindable).

  // scroll to top when switching archive / folder
  useEffect(() => { scrollEl?.scrollTo({ top: 0 }); }, [scrollEl, s.activeViewId, s.categoryId]);

  /** Dropped on the open item panel → attach to it; anywhere else → new items in the current archive. */
  const onDrop = useCallback((paths: string[], files: File[] | undefined, attachTo: string | null) => {
    const st = useApp.getState();
    if (attachTo?.startsWith("memo:")) {
      // dropped on a memo → BlockEditor turns them into image / file blocks
      window.dispatchEvent(new CustomEvent("curio:memo-drop", { detail: { itemId: attachTo.slice(5), paths, files } }));
      return;
    }
    if (attachTo) {
      if (files?.length) void st.attachBlobs(attachTo, files).then(() => st.notify(`파일 ${files.length}개를 연결했어요`));
      else void st.attachPaths(attachTo, paths).then(() => st.notify(`파일 ${paths.length}개를 연결했어요`));
    } else if (files?.length) void st.importBlobs(files);
    else void st.importPaths(paths);
  }, []);
  const drag = useFileDrop(onDrop);
  const dragging = drag.over;

  return (
    <div className="flex h-full">
      <div className="hidden h-full md:flex"><Sidebar /></div>
      {s.drawerOpen && (
        <div className="anim-fade fixed inset-0 z-[60] flex md:hidden" onClick={() => s.setDrawer(false)}>
          <div onClick={(e) => e.stopPropagation()} className="anim-slide h-full"><Sidebar drawer /></div>
          <div className="flex-1 bg-black/40" />
        </div>
      )}
      <main className="flex min-w-0 flex-1 flex-col">
        {s.activeViewId === "sys:trash" ? <TrashView /> : s.activeViewId === "sys:calendar" ? <CalendarPage /> : <>
        <Toolbar />
        <div className="flex min-h-0 flex-1">
          {s.showCategories && <div className="hidden md:flex"><CategoryTree /></div>}
          {s.catDrawer && (
            <div className="anim-fade fixed inset-0 z-[55] flex md:hidden" onClick={() => s.setCatDrawer(false)}>
              <div onClick={(e) => e.stopPropagation()} className="h-full shadow-pop"><CategoryTree /></div>
              <div className="flex-1 bg-black/40" />
            </div>
          )}
          <div className="relative min-w-0 flex-1">
          <div ref={setScrollEl} className="absolute inset-0 overflow-auto">
            <ScrollCtx.Provider value={scrollEl}>
              {!s.ready || !scrollEl ? null : s.items.length === 0 ? (
                <EmptyState />
              ) : view.layout === "gallery" ? (
                <GalleryView items={s.items} card={view.card} />
              ) : view.layout === "masonry" ? (
                <MasonryView items={s.items} card={view.card} />
              ) : view.layout === "table" ? (
                <TableView items={s.items} columns={view.columns} />
              ) : (
                <ListView items={s.items} card={view.card} />
              )}
            </ScrollCtx.Provider>
          </div>
          {/* overlays the list instead of shrinking it → no reflow / flicker */}
          <DetailPanel />
          </div>
        </div>
        </>}
      </main>
      <ContextMenu />
      <ArchiveDialog />
      <SettingsModal />
      <MetadataDialog />
      <LinkDialog />
      <VideoCoverDialog />
      <BulkBar />
      <ImportDialog />
      <Reader />
      <FileViewer />
      <DragGhost />
      <TooltipLayer />

      {dragging && (
        <div className="anim-fade pointer-events-none fixed inset-0 z-50 flex items-center justify-center bg-accent/10 p-6 backdrop-blur-[2px]">
          <div className="flex h-full w-full flex-col items-center justify-center gap-3 rounded-3xl border-2 border-dashed border-accent/60 text-accent">
            <Upload size={36} strokeWidth={1.6} />
            <div className="text-[length:calc(15px*var(--ts))] font-semibold">{drag.attach?.startsWith("memo:") ? "놓으면 메모에 넣어요" : drag.attach ? "놓으면 이 항목에 파일이 연결돼요" : "놓으면 지금 보고 있는 아카이브에 추가돼요"}</div>
            <div className="text-[length:calc(12px*var(--ts))] text-accent/80">PDF·ZIP은 바로 읽을 수 있고, 원본 파일은 이동·복사되지 않아요</div>
          </div>
        </div>
      )}

      {s.toast && (
        <div className="anim-pop fixed bottom-4 left-1/2 z-[95] flex -translate-x-1/2 items-center gap-2 rounded-xl bg-fg px-3 py-2 text-[length:calc(12px*var(--ts))] font-medium text-bg shadow-pop">
          <CircleCheck size={15} className="text-green-400" />{s.toast}
          {s.toastAction && (
            <button className="ml-1 rounded-md px-2 py-0.5 font-semibold text-accent hover:bg-bg/10" onClick={() => { s.toastAction!.run(); useApp.setState({ toast: null, toastAction: null }); }}>
              {s.toastAction.label}
            </button>
          )}
        </div>
      )}
      {s.error && (
        <div className="anim-pop fixed bottom-4 left-1/2 z-[95] flex max-w-lg -translate-x-1/2 items-center gap-2 rounded-xl border border-danger/30 bg-elevated px-3 py-2 shadow-pop">
          <CircleAlert size={16} className="shrink-0 text-danger" />
          <span className="line-clamp-2 text-[length:calc(12px*var(--ts))]">{s.error}</span>
          <button className="btn-icon h-6 w-6" onClick={() => useApp.setState({ error: null })}><X size={13} /></button>
        </div>
      )}
    </div>
  );
}
