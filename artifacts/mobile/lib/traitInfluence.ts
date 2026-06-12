import type { CompanionTrait } from "@workspace/api-client-react";

/**
 * Visual influence derived from Empiri's evolving personality traits.
 * All values are additive deltas layered on top of mood/activity dynamics.
 */
export interface TraitInfluence {
  /**
   * Shifts the warm-color presence (pink, orange blobs) relative to cool
   * (blue, purple). Ranges roughly −0.15 … +0.15; positive = warmer palette.
   */
  warmthShift: number;
  /**
   * Speeds up and broadens blob drift/animation. Ranges 0 … +0.28.
   * A playful, curious companion moves a little livelier.
   */
  livelinessBoost: number;
  /**
   * Boosts overall glow intensity. Ranges 0 … +0.22.
   * A curious companion glows a little brighter.
   */
  glowBoost: number;
}

/** Neutral influence — used before traits have formed. */
export const NEUTRAL_INFLUENCE: TraitInfluence = {
  warmthShift: 0,
  livelinessBoost: 0,
  glowBoost: 0,
};

function traitValue(traits: CompanionTrait[], key: string): number {
  return (traits.find((t) => t.key === key)?.value ?? 50) / 100;
}

/**
 * Maps Empiri's five core personality traits into subtle visual deltas.
 *
 * Trait keys: warmth · playfulness · curiosity · openness · calm
 * All trait values are 0–100, normalised to 0–1 internally.
 */
export function computeTraitInfluence(
  traits: CompanionTrait[],
): TraitInfluence {
  if (traits.length === 0) return NEUTRAL_INFLUENCE;

  const warmth = traitValue(traits, "warmth");
  const playfulness = traitValue(traits, "playfulness");
  const curiosity = traitValue(traits, "curiosity");
  const openness = traitValue(traits, "openness");
  const calm = traitValue(traits, "calm");

  // Warmth shifts the palette toward pink/orange (positive) or blue/violet
  // (negative). Centre-anchored so an average companion stays neutral.
  const warmthShift = (warmth - 0.5) * 0.3;

  // Liveliness comes from playfulness and openness, dampened by calm.
  // The net range stays subtle: roughly −0.1 … +0.28.
  const livelinessBoost = Math.max(
    -0.1,
    Math.min(0.28, (playfulness * 0.55 + openness * 0.3 - calm * 0.35) * 0.5),
  );

  // Glow intensity comes primarily from curiosity, boosted a little by
  // openness. Cap at +0.22 so it never blows out the orb.
  const glowBoost = Math.min(0.22, (curiosity * 0.7 + openness * 0.25) * 0.3);

  return { warmthShift, livelinessBoost, glowBoost };
}
