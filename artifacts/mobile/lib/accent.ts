/**
 * Derives Empiri's UI accent color from its evolving personality.
 *
 * The chrome accent (the status line, the header toggle highlights, the active
 * check-in option, the retry link) is normally the static `statusAccent` token.
 * Here we nudge it along the brand spectrum based on the companion's warmth
 * trait: a warmer companion leans violet/pink, a cooler one leans blue. The
 * shift is subtle and always blends *from* `statusAccent`, so an average
 * (neutral) personality looks exactly as it does today.
 *
 * This module is intentionally pure (no React, no animation) so the color
 * derivation stays separable from any smoothing/interpolation layer.
 */

/** `warmthShift` from TraitInfluence saturates near ±0.15; we normalise to it. */
const WARMTH_RANGE = 0.15;

/** The most we ever pull the accent toward a spectrum anchor — keeps it subtle. */
const MAX_BLEND = 0.4;

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

/** Parse a `#RRGGBB` string into `[r, g, b]` channels (0–255). */
function parseHex(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  return [
    parseInt(h.slice(0, 2), 16),
    parseInt(h.slice(2, 4), 16),
    parseInt(h.slice(4, 6), 16),
  ];
}

function channelHex(c: number): string {
  return clamp(Math.round(c), 0, 255).toString(16).padStart(2, "0");
}

/**
 * Linear-blends two `#RRGGBB` colors. `t` is clamped to 0–1; `t=0` returns `a`,
 * `t=1` returns `b`.
 */
export function mixHex(a: string, b: string, t: number): string {
  const k = clamp(t, 0, 1);
  const [ar, ag, ab] = parseHex(a);
  const [br, bg, bb] = parseHex(b);
  return `#${channelHex(ar + (br - ar) * k)}${channelHex(
    ag + (bg - ag) * k,
  )}${channelHex(ab + (bb - ab) * k)}`;
}

/**
 * Derives the chrome accent from the companion's warmth.
 *
 * Centre-anchored: `warmthShift === 0` returns `statusAccent` unchanged, so an
 * average personality keeps today's look. Positive warmth blends toward the
 * spectrum's pink; negative blends toward its blue. Both anchors live in the
 * existing brand palette, so no new colors are introduced.
 *
 * @param warmthShift  `TraitInfluence.warmthShift` (~−0.15 … +0.15). Positive =
 *                     warmer personality, negative = cooler.
 * @param statusAccent The scheme's neutral accent token (the centre anchor).
 * @param spectrum     The brand spectrum `[blue, purple, pink, orange]`.
 */
export function accentForWarmth(
  warmthShift: number,
  statusAccent: string,
  spectrum: readonly string[],
): string {
  const [blue, , pink] = spectrum;
  const factor = clamp(warmthShift / WARMTH_RANGE, -1, 1);
  if (factor >= 0) return mixHex(statusAccent, pink, factor * MAX_BLEND);
  return mixHex(statusAccent, blue, -factor * MAX_BLEND);
}

/** Gradient surfaces shift even more gently than flat accents. */
const GRADIENT_BLEND = MAX_BLEND * 0.5;

/**
 * Converts a `#RRGGBB` hex color to an `rgba(r,g,b,alpha)` string.
 * Useful when a surface needs transparency applied to a tinted spectrum stop.
 */
export function hexToRgba(hex: string, alpha: number): string {
  const [r, g, b] = parseHex(hex);
  return `rgba(${r},${g},${b},${clamp(alpha, 0, 1)})`;
}

/**
 * Tints a whole brand gradient toward the personality's warm/cool pole.
 *
 * Like `accentForWarmth`, this is centre-anchored: `warmthShift === 0` returns
 * the spectrum unchanged, so a neutral personality keeps today's exact
 * gradient. Each stop blends toward the spectrum's own pink (warm) or blue
 * (cool) anchor, at half the flat-accent strength so gradients stay subtle.
 */
export function spectrumForWarmth(
  warmthShift: number,
  spectrum: readonly string[],
): [string, string, ...string[]] {
  const [blue, , pink] = spectrum;
  const factor = clamp(warmthShift / WARMTH_RANGE, -1, 1);
  const target = factor >= 0 ? pink : blue;
  const t = Math.abs(factor) * GRADIENT_BLEND;
  return spectrum.map((c) => mixHex(c, target, t)) as [
    string,
    string,
    ...string[],
  ];
}
