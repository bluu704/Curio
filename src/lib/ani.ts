/**
 * Windows animated cursors (.ani). Browsers cannot show them, so the RIFF/ACON file is split into
 * its frames (each one an ICO/CUR image the browser can decode) plus the timing of every step.
 */
export interface AniAnim {
  /** object URLs of the frames (image/x-icon) */
  frames: string[];
  /** playback order: frame index + how long it stays (ms) */
  steps: { frame: number; ms: number }[];
  width: number;
  height: number;
}

const JIFFY = 1000 / 60;

export function parseAni(buf: ArrayBuffer): AniAnim {
  const v = new DataView(buf);
  const tag = (o: number) => String.fromCharCode(v.getUint8(o), v.getUint8(o + 1), v.getUint8(o + 2), v.getUint8(o + 3));
  if (buf.byteLength < 12 || tag(0) !== "RIFF" || tag(8) !== "ACON") throw new Error("ANI 파일이 아니에요");
  let nFrames = 0, nSteps = 0, rate = 10, width = 0, height = 0;
  let rates = null as number[] | null, seq = null as number[] | null;
  const icons: Uint8Array[] = [];
  const dwords = (o: number, n: number) => Array.from({ length: n }, (_, i) => v.getUint32(o + i * 4, true));

  const walk = (start: number, end: number) => {
    let o = start;
    while (o + 8 <= end) {
      const id = tag(o), size = v.getUint32(o + 4, true), data = o + 8;
      if (data + size > buf.byteLength) break;
      if (id === "LIST") walk(data + 4, data + size);
      else if (id === "anih" && size >= 36) {
        nFrames = v.getUint32(data + 4, true);
        nSteps = v.getUint32(data + 8, true);
        width = v.getUint32(data + 12, true);
        height = v.getUint32(data + 16, true);
        rate = v.getUint32(data + 28, true) || 10;
      } else if (id === "rate") rates = dwords(data, Math.floor(size / 4));
      else if (id === "seq ") seq = dwords(data, Math.floor(size / 4));
      else if (id === "icon") {
        const ico = new Uint8Array(buf.slice(data, data + size));
        if (ico.length > 6 && ico[2] === 2) ico[2] = 1; // .cur header → .ico (same layout)
        icons.push(ico);
      }
      o = data + size + (size & 1);
    }
  };
  walk(12, buf.byteLength);
  if (!icons.length) throw new Error("ANI 파일에 그림이 없어요");

  const frames = icons.map((b) => URL.createObjectURL(new Blob([b], { type: "image/x-icon" })));
  const count = seq?.length ?? (nSteps || nFrames || icons.length);
  const steps = Array.from({ length: count }, (_, i) => ({
    frame: Math.min(frames.length - 1, seq?.[i] ?? i % frames.length),
    ms: Math.max(16, (rates?.[i] ?? rate) * JIFFY),
  }));
  // size from the first ICO directory entry (0 = 256)
  const d = icons[0];
  if (!width && d.length > 8) width = d[6] || 256;
  if (!height && d.length > 8) height = d[7] || 256;
  return { frames, steps, width, height };
}

export const disposeAni = (a: AniAnim) => a.frames.forEach((u) => URL.revokeObjectURL(u));

export const isAniName = (name: string) => /\.ani$/i.test(name);

/** Parsed animations handed to the reader as "ani:<file id>" page URLs. */
export const aniPages = new Map<string, AniAnim>();
