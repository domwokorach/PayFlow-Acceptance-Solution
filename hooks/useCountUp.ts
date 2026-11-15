"use client";
import { useEffect, useRef, useState } from "react";
import { easeOutCubic, formatLike, lerp, parseAnimatable } from "../lib/countup";

/**
 * Returns `text` as shown on screen: counts up from 0 on first value, and from the previous value on later changes.
 * Non-numeric text, reduced motion and an unchanged value render immediately. Cleans up its animation frame.
 */
export function useCountUp(text: string, duration = 800): string {
  const [shown, setShown] = useState(text);
  const current = useRef<number | null>(null); // the number currently on screen
  const raf = useRef<number | null>(null);

  useEffect(() => {
    const target = parseAnimatable(text);
    const stop = () => { if (raf.current !== null) { cancelAnimationFrame(raf.current); raf.current = null; } };
    const reduced = typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (!target) { stop(); current.current = null; setShown(text); return stop; }
    const from = current.current ?? 0;
    if (reduced || from === target.value || duration <= 0) { stop(); current.current = target.value; setShown(text); return stop; }
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const v = t === 1 ? target.value : lerp(from, target.value, easeOutCubic(t));
      current.current = v;
      setShown(t === 1 ? text : formatLike(v, target));
      raf.current = t < 1 ? requestAnimationFrame(tick) : null;
    };
    raf.current = requestAnimationFrame(tick);
    return stop;
  }, [text, duration]);

  return shown;
}
