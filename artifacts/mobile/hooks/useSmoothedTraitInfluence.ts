import { useEffect } from "react";
import {
  Easing,
  useReducedMotion,
  useSharedValue,
  withTiming,
  type SharedValue,
} from "react-native-reanimated";

import type { TraitInfluence } from "@/lib/traitInfluence";

/** How long a personality shift eases into the orb / ambient glow. */
const TRANSITION_MS = 3000;

/**
 * The trait-influence values that the orb / glow read on the UI thread, as
 * reanimated shared values so a personality shift cross-fades instead of
 * snapping.
 *
 * Only the two dimensions that affect *brightness and warm/cool color balance*
 * are smoothed here, because those are the ones that visibly jump. Liveliness
 * is intentionally left out: it only drives the breathing-loop cadence
 * (duration / drift), which is rebuilt with fixed `withTiming` durations and so
 * cannot follow a continuously-easing value — and a cadence change is never a
 * visible jump. Components keep deriving cadence from the plain target trait.
 */
export interface SmoothedTraitInfluence {
  warmthShift: SharedValue<number>;
  glowBoost: SharedValue<number>;
}

/**
 * Eases Empiri's trait influence toward each new target over ~3s.
 *
 * The shared values start at 0 (neutral), so when the very first fetch resolves
 * the orb blooms gently into its personality rather than snapping. Under
 * reduce-motion the values are assigned directly (calm and instant).
 *
 * Kept separate from the trait *data* source (`useCompanionTraits`) and from
 * the accent-color smoothing (`useAccentColor`) so each concern can evolve
 * independently.
 */
export function useSmoothedTraitInfluence(
  target: TraitInfluence,
): SmoothedTraitInfluence {
  const reduceMotion = useReducedMotion();
  const warmthShift = useSharedValue(0);
  const glowBoost = useSharedValue(0);

  useEffect(() => {
    if (reduceMotion) {
      warmthShift.value = target.warmthShift;
      glowBoost.value = target.glowBoost;
      return;
    }

    const config = {
      duration: TRANSITION_MS,
      easing: Easing.inOut(Easing.ease),
    };
    warmthShift.value = withTiming(target.warmthShift, config);
    glowBoost.value = withTiming(target.glowBoost, config);
  }, [
    target.warmthShift,
    target.glowBoost,
    reduceMotion,
    warmthShift,
    glowBoost,
  ]);

  return { warmthShift, glowBoost };
}
