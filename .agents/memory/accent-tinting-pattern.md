---
name: Personality accent tinting pattern
description: How Empiri's warmth-derived accent must be applied to new surfaces
---

Rule: when tinting any surface with Empiri's personality warmth, always blend *from that surface's own existing base color* (button primary, gradient stops, sheet hex) toward the spectrum's pink/blue poles — never swap in the shared statusAccent-derived color directly.

**Why:** the acceptance bar across accent tasks is "a neutral personality looks pixel-identical to today". Centre-anchored blending from the surface's own base guarantees that; reusing the chrome accent color would change neutral surfaces whose base isn't statusAccent.

**How to apply:** consume the single shared tween `useSmoothedWarmth` (hooks/useAccentColor.ts) once near the screen root and pass the smoothed number down; derive per-surface colors with the pure `accentForWarmth(warmth, base, spectrum)` / `spectrumForWarmth` in lib/accent.ts. Gradients shift at half strength. Reduce-motion snapping is handled inside the tween — never re-implement it per surface. Inner-self/growth sheets are fixed-dark and use the hardcoded spectrum, not the scheme palette.
