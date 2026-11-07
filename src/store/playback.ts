import { create } from "zustand";

/**
 * What is playing for synced lyrics: the YouTube player in the detail panel or a song file.
 * `time` is the position reported at `at` (performance.now()); while playing it is extrapolated.
 */
interface Playback {
  itemId: string | null;
  time: number;
  at: number;
  playing: boolean;
  seek: ((t: number) => void) | null;
  report(itemId: string, time: number, playing: boolean, seek: (t: number) => void): void;
  stop(itemId: string): void;
}

export const usePlayback = create<Playback>((set, get) => ({
  itemId: null, time: 0, at: 0, playing: false, seek: null,
  report(itemId, time, playing, seek) { set({ itemId, time, at: performance.now(), playing, seek }); },
  stop(itemId) { if (get().itemId === itemId) set({ itemId: null, playing: false, seek: null }); },
}));

/** Current position (seconds) of the playback, extrapolated between reports. */
export function playbackNow(): number {
  const p = usePlayback.getState();
  return p.playing ? p.time + (performance.now() - p.at) / 1000 : p.time;
}
