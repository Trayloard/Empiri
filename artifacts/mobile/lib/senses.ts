import type { Percept } from "@workspace/api-client-react";

/**
 * Device senses — opt-in, privacy-safe percepts folded into Empiri's inner
 * self. Everything here is a pure helper so the gating rules (opt-in only,
 * web degrades to daypart, buffers capped) are unit-testable without any
 * native sensor modules. The subscription lifecycle lives in
 * CompanionContext; this file decides *what* counts as a percept.
 */

/** AsyncStorage key for the opt-in flag. Senses are OFF by default. */
export const SENSES_KEY = "empiri.sensesEnabled";

/** The server accepts at most 8 percepts per request (spec maxItems). */
export const MAX_OUTGOING_PERCEPTS = 8;

/** Total acceleration (in g) above which a movement counts as a shake. */
export const SHAKE_THRESHOLD_G = 2.2;

/** Ignore repeat shakes inside this window so one wiggle isn't ten percepts. */
export const SHAKE_COOLDOWN_MS = 8_000;

/** Battery fraction (0–1) below which we consider the device "running low". */
export const BATTERY_LOW_LEVEL = 0.2;

export type Daypart =
  | "early_morning"
  | "morning"
  | "midday"
  | "afternoon"
  | "evening"
  | "night"
  | "late_night";

/** Map an hour-of-day (0–23) onto the daypart buckets the self understands. */
export function daypartBucket(hour: number): Daypart {
  if (hour >= 5 && hour < 8) return "early_morning";
  if (hour >= 8 && hour < 11) return "morning";
  if (hour >= 11 && hour < 14) return "midday";
  if (hour >= 14 && hour < 17) return "afternoon";
  if (hour >= 17 && hour < 21) return "evening";
  if (hour >= 21 && hour < 24) return "night";
  return "late_night"; // 0–4
}

/** The ambient time-of-day percept. Cheap, no permissions, works everywhere. */
export function daypartPercept(now: number = Date.now()): Percept {
  return {
    kind: "daypart",
    intensity: 0.45,
    at: now,
    detail: daypartBucket(new Date(now).getHours()),
  };
}

/** Total acceleration magnitude in g from an accelerometer sample. */
export function shakeMagnitude(sample: {
  x: number;
  y: number;
  z: number;
}): number {
  return Math.sqrt(
    sample.x * sample.x + sample.y * sample.y + sample.z * sample.z,
  );
}

/**
 * Decide whether an accelerometer magnitude counts as a fresh shake percept.
 * Returns null below the threshold or while the cooldown from the previous
 * shake is still running. Intensity scales gently with vigour.
 */
export function detectShake(
  magnitude: number,
  lastShakeAt: number | null,
  now: number = Date.now(),
): Percept | null {
  if (magnitude < SHAKE_THRESHOLD_G) return null;
  if (lastShakeAt != null && now - lastShakeAt < SHAKE_COOLDOWN_MS) return null;
  const vigour = Math.min(1, (magnitude - SHAKE_THRESHOLD_G) / 2);
  return {
    kind: "shake",
    intensity: Math.min(1, 0.5 + vigour * 0.5),
    at: now,
  };
}

/**
 * Emit a charging percept only on the moment the cable goes in
 * (false → true). `wasCharging: null` means "state unknown" (first read
 * after subscribing) and never fires, so plugging in *before* opening the
 * app is ambience, not an event.
 */
export function chargingPercept(
  wasCharging: boolean | null,
  isCharging: boolean,
  now: number = Date.now(),
): Percept | null {
  if (wasCharging !== false || !isCharging) return null;
  return { kind: "charging", intensity: 0.4, at: now };
}

/**
 * Emit a battery-low percept when the level sinks under the threshold while
 * unplugged, at most once per session (`alreadyReported`).
 */
export function batteryLowPercept(
  level: number,
  isCharging: boolean,
  alreadyReported: boolean,
  now: number = Date.now(),
): Percept | null {
  if (alreadyReported || isCharging) return null;
  if (level < 0 || level >= BATTERY_LOW_LEVEL) return null;
  return { kind: "battery_low", intensity: 0.55, at: now };
}

/**
 * Add a percept to the session buffer, keeping only the freshest percept per
 * kind and never growing past the outgoing cap. Returns a new array.
 */
export function pushPercept(buffer: Percept[], percept: Percept): Percept[] {
  const next = buffer.filter((p) => p.kind !== percept.kind);
  next.push(percept);
  return next.slice(-MAX_OUTGOING_PERCEPTS);
}

/**
 * Everything a request may carry as percepts, in one gate:
 *  - senses disabled → nothing, ever (opt-in is the hard boundary);
 *  - web → daypart only (no motion/battery sensors in the browser build);
 *  - native → buffered sensor percepts plus the ambient daypart, capped.
 */
export function collectOutgoingPercepts(options: {
  enabled: boolean;
  isWeb: boolean;
  buffer: Percept[];
  now?: number;
}): Percept[] {
  const { enabled, isWeb, buffer } = options;
  const now = options.now ?? Date.now();
  if (!enabled) return [];
  const ambient = daypartPercept(now);
  if (isWeb) return [ambient];
  return [...buffer, ambient].slice(-MAX_OUTGOING_PERCEPTS);
}
