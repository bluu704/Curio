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

/**
 * A frame 10% into a video (max 90 s, past black intros), taken by the browser's own player — no ffmpeg.
 * Desktop files come through Tauri's asset protocol, which allows this (CORS), so the frame can be read.
 */
export function videoFrame(src: string, width = 720): Promise<string | null> {
  return new Promise((res) => {
    const v = document.createElement("video");
    let settled = false;
    const done = (r: string | null) => { if (settled) return; settled = true; clearTimeout(timer); v.removeAttribute("src"); v.load(); res(r); };
    const timer = setTimeout(() => done(null), 15000);
    v.crossOrigin = "anonymous";
    v.muted = true; v.preload = "auto"; v.playsInline = true;
    v.onloadedmetadata = () => { v.currentTime = Math.min(90, (Number.isFinite(v.duration) ? v.duration : 0) * 0.1); };
    v.onseeked = () => {
      try {
        const k = Math.min(1, width / (v.videoWidth || width));
        const c = Object.assign(document.createElement("canvas"), { width: Math.round(v.videoWidth * k), height: Math.round(v.videoHeight * k) });
        if (!c.width || !c.height) return done(null);
        c.getContext("2d")!.drawImage(v, 0, 0, c.width, c.height);
        done(c.toDataURL("image/jpeg", 0.85));
      } catch { done(null); }
    };
    v.onerror = () => done(null);
    v.src = src;
  });
}

/** First page of a PDF / image ZIP, the picture itself, or a frame of a video, as a small cover. */
export async function firstPageCover(f: FileRef): Promise<string | null> {
  if (f.kind === "video") {
    // the web version makes this when the file is uploaded; the desktop does it here
    const url = api.caps.localFiles ? api.fileUrl(f) : null;
    return url ? videoFrame(url) : null;
  }
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
