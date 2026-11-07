import { api } from "@/api";
import type { FileRef } from "@/api/types";

/** A readable document = N pages, each resolvable to an image URL. */
export interface PageSource {
  count: number;
  url(i: number): Promise<string>;
  dispose(): void;
}

const isPdf = (f: FileRef) => /\.pdf$/i.test(f.name);
export const isReadable = (f: FileRef) =>
  isPdf(f) || /\.(zip|cbz)$/i.test(f.name) || f.kind === "folder" || f.kind === "image";

export async function openSource(file: FileRef): Promise<PageSource> {
  if (isPdf(file)) return openPdf(file);
  const names = await api.listPages(file);
  return { count: names.length, url: async (i) => api.pageUrl(file, i), dispose() {} };
}

let workerPort: Worker | null = null;
/**
 * pdf.js worker started from a blob: URL built from the bundled worker source. A file URL breaks in the
 * single-file preview / sandboxed pages ("Setting up fake worker failed: failed to fetch dynamically imported module").
 */
async function pdfWorker(): Promise<Worker> {
  if (!workerPort) {
    const code = (await import("pdfjs-dist/build/pdf.worker.min.mjs?raw")).default as string;
    workerPort = new Worker(URL.createObjectURL(new Blob([code], { type: "text/javascript" })), { type: "module" });
  }
  return workerPort;
}

/** PDF via pdf.js (lazy-loaded). Pages are rendered to canvas → blob URLs on demand and cached. */
async function openPdf(file: FileRef): Promise<PageSource> {
  const url = api.fileUrl(file);
  if (!url) throw new Error("PDF를 열 수 없어요");
  const pdfjs = await import("pdfjs-dist");
  if (self.origin === "null" || location.protocol === "file:") {
    // Sandboxed / file:// pages (opaque origin) cannot run the worker. pdf.js then runs its parser on the
    // main thread, and finds it here instead of trying to import a file (which is what failed before).
    (globalThis as { pdfjsWorker?: unknown }).pdfjsWorker = await import("pdfjs-dist/build/pdf.worker.min.mjs");
  } else {
    pdfjs.GlobalWorkerOptions.workerPort = await pdfWorker();
  }
  // Hand pdf.js the bytes (not the URL): works the same for asset://, blob: and sandboxed/opaque origins.
  const data = new Uint8Array(await (await fetch(url)).arrayBuffer());
  const doc = await pdfjs.getDocument({ data }).promise;
  const cache = new Map<number, Promise<string>>();
  const render = async (i: number) => {
    const page = await doc.getPage(i + 1);
    const base = page.getViewport({ scale: 1 });
    const scale = Math.min(4, (1800 * Math.min(2, devicePixelRatio || 1)) / Math.max(base.width, base.height));
    const vp = page.getViewport({ scale });
    const canvas = document.createElement("canvas");
    canvas.width = vp.width;
    canvas.height = vp.height;
    await page.render({ canvasContext: canvas.getContext("2d")!, viewport: vp }).promise;
    const blob = await new Promise<Blob>((res) => canvas.toBlob((b) => res(b!), "image/jpeg", 0.92));
    return URL.createObjectURL(blob);
  };
  return {
    count: doc.numPages,
    url: (i) => {
      if (!cache.has(i)) cache.set(i, render(i));
      return cache.get(i)!;
    },
    dispose() {
      cache.forEach((p) => void p.then(URL.revokeObjectURL));
      void doc.destroy();
    },
  };
}
