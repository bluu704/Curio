import { useEffect, useState } from "react";

/** True below the md breakpoint (phones, small tablets in portrait). */
export function useNarrow(query = "(max-width: 767px)") {
  const [m, setM] = useState(() => typeof window !== "undefined" && window.matchMedia(query).matches);
  useEffect(() => {
    const mq = window.matchMedia(query);
    const on = () => setM(mq.matches);
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, [query]);
  return m;
}
