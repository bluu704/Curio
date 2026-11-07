import { useEffect, useState } from "react";
import { api } from "@/api";

/**
 * Window-level drag & drop of files/folders.
 * - Tauri: native event gives absolute paths (works for folders and huge files; nothing is read).
 * - Browser: real File objects (uploaded to the preview backend; PDF/ZIP become readable).
 */
/** Element under the pointer with `data-drop-attach` = item id to attach files to. */
/** Over an item's memo (`data-drop-memo`) → "memo:<id>": files become memo blocks. */
const attachAt = (x: number, y: number) => {
  const el = document.elementFromPoint(x, y);
  const memo = (el?.closest("[data-drop-memo]") as HTMLElement | null)?.dataset.dropMemo;
  if (memo) return `memo:${memo}`;
  return (el?.closest("[data-drop-attach]") as HTMLElement | null)?.dataset.dropAttach ?? null;
};

export function useFileDrop(onPaths: (paths: string[], files: File[] | undefined, attachTo: string | null) => void) {
  const [over, setOverState] = useState(false);
  const [attach, setAttach] = useState<string | null>(null);
  const setOver = (v: boolean) => { setOverState(v); if (!v) setAttach(null); };

  useEffect(() => {
    if (api.caps.platform === "tauri") {
      let unlisten: (() => void) | undefined;
      let cancelled = false;
      void import("@tauri-apps/api/webview").then(async ({ getCurrentWebview }) => {
        const un = await getCurrentWebview().onDragDropEvent((e) => {
          const p = e.payload;
          const at = "position" in p ? attachAt(p.position.x / devicePixelRatio, p.position.y / devicePixelRatio) : null;
          if (p.type === "enter" || p.type === "over") { setOver(true); setAttach(at); }
          else if (p.type === "leave") setOver(false);
          else if (p.type === "drop") { setOver(false); if (p.paths.length) onPaths(p.paths, undefined, at); }
        });
        if (cancelled) un(); else unlisten = un;
      });
      return () => { cancelled = true; unlisten?.(); };
    }

    let depth = 0;
    const hasFiles = (e: DragEvent) => !!e.dataTransfer?.types.includes("Files");
    const enter = (e: DragEvent) => { if (!hasFiles(e)) return; depth++; setOver(true); };
    const leave = (e: DragEvent) => { if (!hasFiles(e)) return; depth = Math.max(0, depth - 1); if (!depth) setOver(false); };
    const overH = (e: DragEvent) => { if (hasFiles(e)) { e.preventDefault(); setAttach(attachAt(e.clientX, e.clientY)); } };
    const drop = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault(); depth = 0; setOver(false);
      const files = Array.from(e.dataTransfer?.files ?? []);
      if (files.length) onPaths(files.map((f) => f.name), files, attachAt(e.clientX, e.clientY));
    };
    window.addEventListener("dragenter", enter);
    window.addEventListener("dragleave", leave);
    window.addEventListener("dragover", overH);
    window.addEventListener("drop", drop);
    return () => {
      window.removeEventListener("dragenter", enter);
      window.removeEventListener("dragleave", leave);
      window.removeEventListener("dragover", overH);
      window.removeEventListener("drop", drop);
    };
  }, [onPaths]);

  return { over, attach };
}
