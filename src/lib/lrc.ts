/** One timed lyric line. */
export interface LrcLine { t: number; text: string }

/**
 * Parse LRC text ("[01:02.30]line", several stamps per line allowed, optional "[offset:+250]").
 * Returns lines sorted by time (seconds).
 */
export function parseLrc(src: string): LrcLine[] {
  const out: LrcLine[] = [];
  let offset = 0;
  for (const raw of src.split(/\r?\n/)) {
    const off = /^\s*\[offset:\s*([+-]?\d+)\s*\]/i.exec(raw);
    if (off) { offset = Number(off[1]) / 1000; continue; }
    const stamps: number[] = [];
    const re = /\[(\d{1,3}):(\d{1,2}(?:[.:]\d{1,3})?)\]/g;
    let m: RegExpExecArray | null;
    let end = 0;
    while ((m = re.exec(raw)) && m.index === end) {
      stamps.push(Number(m[1]) * 60 + Number(m[2].replace(":", ".")));
      end = re.lastIndex;
    }
    if (!stamps.length) continue;
    const text = raw.slice(end).trim();
    for (const t of stamps) out.push({ t: Math.max(0, t - offset), text });
  }
  return out.sort((a, b) => a.t - b.t);
}

/** Index of the line being sung at `time` (−1 before the first line). */
export function lineAt(lines: LrcLine[], time: number): number {
  let lo = 0, hi = lines.length - 1, ans = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (lines[mid].t <= time) { ans = mid; lo = mid + 1; } else hi = mid - 1;
  }
  return ans;
}
