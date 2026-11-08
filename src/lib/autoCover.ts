import { api } from "@/api";
import type { FileRef, Item } from "@/api/types";
import { openSource } from "@/components/reader/source";
import { isAniName } from "./ani";

/** A cover made by the app as a stand-in (generated SVG), not a real picture. */
const placeholder = (uri: string | null) => !uri || uri.startsWith("data:image/svg+xml");

function shrink(url: string): Promise<string | null> {
  return new Promise((res) => {
    const img = new Image();
    img.onload = () => {
      try {
        const k = Math.min(1, 480 / img.width);
        const c = Object.assign(document.createElement("canvas"), { width: Math.round(img.width * k), height: Math.round(img.height * k) });
        c.getContext("2d")!.drawImage(img, 0, 0, c.width, c.height);
        res(c.toDataURL("image/jpeg", 0.85));
      } catch { res(null); }
    };
    img.onerror = () => res(null);
    img.src = url;
  });
}

/** First page of a PDF / image ZIP, or the picture itself, as a small cover. */
export async function firstPageCover(f: FileRef): Promise<string | null> {
  const pdf = /\.pdf$/i.test(f.name), zip = /\.(zip|cbz)$/i.test(f.name), img = f.kind === "image" && !isAniName(f.name);
  if (!pdf && !zip && !img) return null;
  if (api.caps.localFiles && !pdf) return null; // the desktop app makes those covers itself
  try {
    const src = await openSource(f);
    try { return src.count ? await shrink(await src.url(0)) : null; } finally { src.dispose(); }
  } catch { return null; }
}

/** Give items without a real cover the first page of their first PDF / ZIP / picture. */
export async function autoCovers(itemIds: string[], update: (id: string, coverUri: string) => Promise<void>) {
  for (const id of itemIds) {
    let it: Item;
    try { it = await api.getItem(id); } catch { continue; }
    if (!placeholder(it.coverUri)) continue;
    for (const f of it.files) {
      const c = await firstPageCover(f);
      if (c) { await update(id, c); break; }
    }
  }
}
