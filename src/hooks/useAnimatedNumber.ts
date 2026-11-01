import { useEffect, useRef, useState } from 'react';

const DURATION_MS = 450;

function prefersReducedMotion(): boolean {
  return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/**
 * Rolls a whole number (e.g. centimes) from its previous value to `target`.
 * The first value shows as-is; later changes ease out over ~0.45 s, or jump
 * straight there when the user prefers reduced motion.
 */
export function useAnimatedNumber(target: number): { value: number; animating: boolean } {
  const [value, setValue] = useState(target);
  const current = useRef(target);

  useEffect(() => {
    const from = current.current;
    if (from === target) return;
    if (prefersReducedMotion()) {
      current.current = target;
      setValue(target);
      return;
    }
    const start = performance.now();
    let frame = 0;
    const step = (now: number) => {
      const t = Math.min(1, (now - start) / DURATION_MS);
      const eased = 1 - (1 - t) ** 3;
      const next = t >= 1 ? target : Math.round(from + (target - from) * eased);
      current.current = next;
      setValue(next);
      if (t < 1) frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [target]);

  return { value, animating: value !== target };
}
