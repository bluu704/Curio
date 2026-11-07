import type { FileRef } from "@/api/types";

const ext = (f: FileRef) => f.name.split(".").pop()?.toLowerCase() ?? "";
export const isVideo = (f: FileRef) => f.kind === "video" && ["mp4", "m4v", "webm", "mov", "ogv"].includes(ext(f));
export const isAudio = (f: FileRef) => f.kind === "audio";
export const isText = (f: FileRef) => f.kind === "text";
export const isMarkdown = (f: FileRef) => ["md", "markdown"].includes(ext(f));
/** Files the built-in viewer can play or show (PDF/ZIP/images go to the reader instead). */
export const isViewable = (f: FileRef) => isVideo(f) || isAudio(f) || isText(f);
