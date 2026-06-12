import { useEffect, useRef, useState } from "react";
import { useReducedMotion } from "react-native-reanimated";

import { useColors } from "@/hooks/useColors";
import { accentForWarmth } from "@/lib/accent";

/** How long the accent eases toward a new warmth value. */
const TWEEN_MS = 900;

function easeInOut(t: number): number {
  return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
}

/**
 * Returns Empiri's chrome accent color, derived from its current warmth and
 * eased gently toward each new value so personality shifts never hard-flip.
 *
 * Takes a raw `warmthShift` number (not the whole influence) so it stays fully
 * independent of the orb/trait-smoothing work. If upstream trait smoothing lands
 * later, this local tween can be shortened or removed without conflict.
 *
 * Color derivation lives in the pure `accentForWarmth`; this hook only owns the
 * smoothing, keeping the two concerns separable.
 */
export function useAccentColor(warmthShift: number): string {
  const colors = useColors();
  const reduceMotion = useReducedMotion();

  const [warmth, setWarmth] = useState(warmthShift);
  // The value the tween is currently at — also the starting point if a new
  // target arrives mid-tween.
  const currentRef = useRef(warmthShift);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    if (rafRef.current != null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }

    if (reduceMotion) {
      currentRef.current = warmthShift;
      setWarmth(warmthShift);
      return;
    }

    const from = currentRef.current;
    const to = warmthShift;
    if (from === to) return;

    const start = Date.now();
    const tick = () => {
      const p = Math.min(1, (Date.now() - start) / TWEEN_MS);
      const value = from + (to - from) * easeInOut(p);
      currentRef.current = value;
      setWarmth(value);
      if (p < 1) {
        rafRef.current = requestAnimationFrame(tick);
      } else {
        currentRef.current = to;
        rafRef.current = null;
      }
    };
    rafRef.current = requestAnimationFrame(tick);

    return () => {
      if (rafRef.current != null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
  }, [warmthShift, reduceMotion]);

  return accentForWarmth(warmth, colors.statusAccent, colors.spectrum);
}
