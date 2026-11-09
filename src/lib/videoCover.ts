import { api } from "@/api";
import { useApp } from "@/store/app";

/**
 * Make the frame currently shown in `video` the item's cover, grabbed straight from the player
 * (the <video> is crossOrigin="anonymous", so desktop files can be read). The backend's ffmpeg is
 * only a fallback for setups where the browser may not read the frame.
 */
export async function coverFromVideo(video: HTMLVideoElement, itemId: string, fileId: string) {
  const s = useApp.getState();
  try {
    const k = Math.min(1, 1280 / (video.videoWidth || 1280));
    const c = Object.assign(document.createElement("canvas"), { width: Math.round(video.videoWidth * k), height: Math.round(video.videoHeight * k) });
    if (!c.width || !c.height) throw new Error("영상이 아직 준비되지 않았어요");
    c.getContext("2d")!.drawImage(video, 0, 0, c.width, c.height);
    const url = c.toDataURL("image/jpeg", 0.88); // throws on a "tainted" (cross-origin) frame
    await s.updateItem(itemId, { coverUri: url });
  } catch (e) {
    if (!api.coverFromVideo || (e instanceof Error && e.message.includes("준비"))) throw e;
    await api.coverFromVideo(itemId, fileId, video.currentTime);
    await s.refresh();
    if (s.selectedId === itemId) await s.select(itemId);
  }
  s.notify("이 장면을 표지로 했어요");
}
