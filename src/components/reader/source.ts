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

/** PDF via pdf.js (lazy-loaded). Pages are rendered to canvas → blob URLs on demand and cached. */
async function openPdf(file: FileRef): Promise<PageSource> {
  const url = api.fileUrl(file);
  if (!url) throw new Error("PDF를 열 수 없어요");
  const pdfjs = await import("pdfjs-dist");
  const worker = (await import("pdfjs-dist/build/pdf.worker.min.mjs?url")).default;
  pdfjs.GlobalWorkerOptions.workerSrc = worker;
  const doc = await pdfjs.getDocument({ url }).promise;
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
