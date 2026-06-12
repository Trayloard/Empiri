---
name: Empiri orb/glow trait smoothing
description: How/why personality (trait) changes are eased on the orb + ambient glow, and what must NOT be eased
---

The orb (CompanionOrb) and ambient glow (AmbientGlow) layer Empiri's evolving
personality (TraitInfluence: warmthShift, livelinessBoost, glowBoost) on top of
status/mood dynamics. To make a personality shift cross-fade (~3s) instead of
snapping:

- Ease ONLY the trait contribution to per-blob opacity, never the status/mood
  contribution. Idle->listening/thinking/speaking must stay instant. The split:
  status/mood -> JS base numbers (snappy); warmthShift+glowBoost -> reanimated
  SharedValues (useSmoothedTraitInfluence, 3s withTiming). Per-blob opacity is
  recombined in a useDerivedValue worklet inside a per-blob wrapper component
  (OrbBlob/AmbientBlob) and passed to GlowBlob (opacity: number|SharedValue).

**Why liveliness (breathing cadence/drift) is NOT eased:** duration/drift feed
GlowBlob's withRepeat breathing loop, whose useEffect rebuilds on any dep
change. Feeding a continuously-easing value would cancel+restart the loop every
frame and freeze the breathing. So cadence stays JS-derived from the settled
target trait; the <=17% retarget on the rare 5-min refresh is invisible.

**Warm-tone threshold:** the orb's old `warm` boolean (intensity >= threshold)
is a hidden discontinuity that snaps pink/orange by ~0.35*intensity mid-fade.
Replaced with a smoothstep ramp over [threshold-0.1, threshold] reaching 1 AT
the threshold, so every resting mood's appearance is byte-identical to the old
boolean and only the false->true crossing is softened.

**Separability:** orb/glow trait smoothing is independent of useCompanionTraits
(data source, returns plain TraitInfluence) and of useAccentColor (chrome accent
owns its own tween on raw warmthShift). Don't merge them.
