import { useEffect, useMemo, useRef } from "react";
import { api } from "@/api";
import type { FileRef } from "@/api/types";
import { usePlayback } from "@/store/playback";

/**
 * YouTube player that reports its position (for synced lyrics) through the embed's message channel:
 * after "listening" the player posts `infoDelivery` with `currentTime`; commands seek it.
 */
export function YouTubePlayer({ itemId, videoId, title }: { itemId: string; videoId: string; title: string }) {
  const frame = useRef<HTMLIFrameElement>(null);
  useEffect(() => {
    const send = (msg: object) => frame.current?.contentWindow?.postMessage(JSON.stringify(msg), "*");
    const seek = (t: number) => { send({ event: "command", func: "seekTo", args: [t, true] }); send({ event: "command", func: "playVideo", args: [] }); };
    let last = 0, playing = false;
    const onMsg = (e: MessageEvent) => {
      if (e.source !== frame.current?.contentWindow || typeof e.data !== "string") return;
      let d: { event?: string; info?: { currentTime?: number; playerState?: number } };
      try { d = JSON.parse(e.data); } catch { return; }
      if (d.event !== "infoDelivery" && d.event !== "onStateChange" && d.event !== "initialDelivery") return;
      if (typeof d.info?.playerState === "number") playing = d.info.playerState === 1;
      if (typeof d.info?.currentTime === "number") last = d.info.currentTime;
      usePlayback.getState().report(itemId, last, playing, seek);
    };
    window.addEventListener("message", onMsg);
    // ask the embed to start sending its state (repeat until it answers)
    const ping = setInterval(() => send({ event: "listening", id: itemId, channel: "widget" }), 1000);
    return () => { window.removeEventListener("message", onMsg); clearInterval(ping); usePlayback.getState().stop(itemId); };
  }, [itemId, videoId]);
  return (
    <div className="mt-5 overflow-hidden rounded-xl bg-black shadow-card">
      <iframe
        ref={frame}
        className="aspect-video w-full"
        src={`https://www.youtube-nocookie.com/embed/${videoId}?enablejsapi=1&origin=${encodeURIComponent(location.origin)}`}
        title={title}
        allow="autoplay; encrypted-media; picture-in-picture"
        allowFullScreen
      />
    </div>
  );
}

/** A song file of the item, played in place (also drives synced lyrics). */
export function AudioPlayer({ itemId, file }: { itemId: string; file: FileRef }) {
  const ref = useRef<HTMLAudioElement>(null);
  // one URL per file (the preview makes a new blob: URL on every call, which would restart playback)
  const src = useMemo(() => api.fileUrl(file), [file.id]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const a = ref.current;
    if (!a) return;
    const seek = (t: number) => { a.currentTime = t; void a.play(); };
    const report = () => usePlayback.getState().report(itemId, a.currentTime, !a.paused && !a.ended, seek);
    const evs = ["timeupdate", "play", "pause", "seeked", "ended"] as const;
    evs.forEach((e) => a.addEventListener(e, report));
    return () => { evs.forEach((e) => a.removeEventListener(e, report)); usePlayback.getState().stop(itemId); };
  }, [itemId, src]);
  if (!src) return null;
  return <audio ref={ref} src={src} controls preload="metadata" className="mt-5 w-full" />;
}
