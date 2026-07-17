export type OrbBlobKind =
  | "halo"
  | "blue"
  | "purple"
  | "pink"
  | "orange"
  | "core";

export type AmbientBlobKind = "top" | "left" | "right" | "bottom";

/**
 * Resting opacity of one orb blob.
 *
 * `baseIntensity` / `baseCoreBoost` come from mood/activity dynamics (snappy),
 * while `glowBoost` / `warmthShift` are the eased personality contribution.
 * The pink/orange warm tones ramp up to the warmth threshold via a smoothstep
 * over a 0.1 window below it, reaching full warmth exactly AT the threshold —
 * so resting appearances match the old boolean, and only the false→true
 * crossing is softened.
 */
export function orbBlobOpacity(
  kind: OrbBlobKind,
  baseIntensity: number,
  baseCoreBoost: number,
  glowBoost: number,
  warmthShift: number,
): number {
  "worklet";
  if (kind === "core") {
    const coreBoost = Math.min(1.35, baseCoreBoost + glowBoost * 0.5);
    return Math.min(1, 0.85 * coreBoost);
  }

  const intensity = Math.min(1, baseIntensity + glowBoost);
  const warmBoost = warmthShift * 0.4;

  if (kind === "halo") return Math.min(1, 0.45 * intensity);
  if (kind === "blue") {
    return Math.min(1, Math.max(0.3, 0.9 * intensity - warmBoost * 0.5));
  }
  if (kind === "purple") {
    return Math.min(1, Math.max(0.35, 0.9 * intensity - warmBoost * 0.25));
  }

  const warmThreshold = 0.85 - warmthShift * 1.5;
  const lo = warmThreshold - 0.1;
  let t = (intensity - lo) / 0.1;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  const warmRamp = t * t * (3 - 2 * t);

  if (kind === "pink") {
    const base = 0.5 + 0.35 * warmRamp;
    return Math.min(1, base * intensity + warmBoost);
  }
  // orange
  const base = 0.32 + 0.38 * warmRamp;
  return Math.min(1, base * intensity + warmBoost * 0.8);
}

/**
 * Resting opacity of one ambient background blob. Purple (top) is neutral on
 * the warm/cool axis; pink (right) is boosted by warmth; the blues (left,
 * bottom) recede as warmth rises.
 */
export function ambientBlobOpacity(
  kind: AmbientBlobKind,
  baseIntensity: number,
  glowBoost: number,
  warmthShift: number,
): number {
  "worklet";
  const intensity = Math.min(1, baseIntensity + glowBoost * 0.7);
  const warmBoost = Math.max(0, warmthShift);
  const coolDamp = Math.max(0, -warmthShift);

  let op: number;
  if (kind === "top") {
    op = 0.5 * intensity;
  } else if (kind === "left") {
    op = Math.max(0.15, 0.4 * intensity - coolDamp * 0.25);
  } else if (kind === "right") {
    op = Math.min(0.75, 0.38 * intensity + warmBoost * 0.3);
  } else {
    // bottom blue
    op = Math.max(0.1, 0.3 * intensity - coolDamp * 0.2);
  }
  return Math.min(1, op);
}
