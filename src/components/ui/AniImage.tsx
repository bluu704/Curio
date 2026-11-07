import { useEffect, useState } from "react";
import type { AniAnim } from "@/lib/ani";

/** Plays a parsed .ani cursor: frames swap on their own timing, pixels stay sharp when scaled up. */
export function AniImage({ anim, className, scale = 6 }: { anim: AniAnim; className?: string; scale?: number }) {
  const [i, setI] = useState(0);
  useEffect(() => {
    if (anim.steps.length < 2) return;
    const t = setTimeout(() => setI((n) => (n + 1) % anim.steps.length), anim.steps[i % anim.steps.length].ms);
    return () => clearTimeout(t);
  }, [anim, i]);
  const step = anim.steps[i % anim.steps.length] ?? { frame: 0 };
  const w = (anim.width || 32) * scale;
  return (
    <img src={anim.frames[step.frame]} alt="" draggable={false} className={className}
      style={{ width: w, maxWidth: "100%", height: "auto", imageRendering: "pixelated" }} />
  );
}
