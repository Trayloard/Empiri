import type {
  BlockDefinition,
  NeuroParams,
  NowMs,
  Percept,
  PerceptKind,
} from "../types";
import { clamp } from "../util";

/**
 * The senses block — Empiri's gentle device perception (opt-in only).
 *
 * The client reports coarse, privacy-safe percepts (a shake, the charger
 * clicking in, a low battery, the time of day) and this block holds the few
 * most recent ones for a short freshness window. A fresh, salient percept may
 * surface as ONE quiet sentence in the persona; a per-kind throttle keeps the
 * mentions rare so they stay special. Stale percepts are pruned on decay, so
 * an old shake can never be mentioned an hour later.
 */

export const SENSES_BLOCK_ID = "senses";

const MINUTE_MS = 60_000;
const HOUR_MS = 3_600_000;

export interface SensesData {
  /** The few most recent percepts, newest first. Pruned by freshness decay. */
  recent: Percept[];
  /**
   * Epoch ms a percept of this kind was last offered to the persona at full
   * strength. "Offered", not "voiced": contributePersona is pure/read-only, so
   * the stamp is set at fold time when a percept passes the throttle — the
   * deterministic approximation of "Empiri got the chance to mention it".
   */
  lastOfferedAt: Record<string, NowMs>;
}

const VALID_KINDS: ReadonlySet<string> = new Set<PerceptKind>([
  "shake",
  "charging",
  "battery_low",
  "daypart",
]);

/** Longest `detail` accepted (matches the API schema bound). */
const MAX_DETAIL_LENGTH = 32;

/**
 * Validate and normalise raw percepts from the client. Lenient per entry
 * (one malformed percept never discards the rest): unknown kinds and
 * non-numeric fields are dropped, intensity is clamped to 0..1, future
 * timestamps are clamped to `now` (client clock skew), stale ones are
 * rejected, and only the newest percept per kind survives (a burst of three
 * shakes is still one moment). Output is newest-first, capped at
 * `params.senses.maxPerFold`.
 */
export function sanitizePercepts(
  raw: unknown,
  now: NowMs,
  params: NeuroParams,
): Percept[] {
  if (!Array.isArray(raw)) return [];
  const staleBefore = now - params.senses.maxStaleHours * HOUR_MS;
  const byKind = new Map<string, Percept>();
  for (const entry of raw) {
    if (!entry || typeof entry !== "object") continue;
    const { kind, intensity, at, detail } = entry as {
      kind?: unknown;
      intensity?: unknown;
      at?: unknown;
      detail?: unknown;
    };
    if (typeof kind !== "string" || !VALID_KINDS.has(kind)) continue;
    if (typeof intensity !== "number" || Number.isNaN(intensity)) continue;
    if (typeof at !== "number" || !Number.isFinite(at)) continue;
    const clampedAt = Math.min(at, now);
    if (clampedAt < staleBefore) continue;
    const clean: Percept = {
      kind: kind as PerceptKind,
      intensity: clamp(intensity, 0, 1),
      at: clampedAt,
    };
    if (typeof detail === "string") {
      const trimmed = detail.trim().slice(0, MAX_DETAIL_LENGTH);
      if (trimmed.length > 0) clean.detail = trimmed;
    }
    const existing = byKind.get(clean.kind);
    if (!existing || clean.at > existing.at) byKind.set(clean.kind, clean);
  }
  return [...byKind.values()]
    .sort((a, b) => b.at - a.at)
    .slice(0, Math.max(0, params.senses.maxPerFold));
}

/**
 * The tiny drive nudges a set of percepts produces — how perception subtly
 * colours mood. Values live in the same 0..1 domain as message signal
 * strengths but are deliberately small (a percept is an ambient feeling, not
 * a conversation). Scaled by `params.senses.driveImpulseScale` and capped so
 * even a burst of percepts stays gentle.
 */
export function perceptDriveNudges(
  percepts: Percept[],
  params: NeuroParams,
): { connection: number; curiosity: number; novelty: number; expression: number } {
  const scale = params.senses.driveImpulseScale;
  let connection = 0;
  let curiosity = 0;
  let novelty = 0;
  let expression = 0;
  for (const p of percepts) {
    switch (p.kind) {
      case "shake":
        // A playful jolt — something new just happened.
        novelty += 0.25 * p.intensity;
        expression += 0.1 * p.intensity;
        break;
      case "charging":
        // Settled and cared for — a cozy kind of closeness.
        connection += 0.12 * p.intensity;
        break;
      case "battery_low":
        // A soft tiredness — leaning a little on the company.
        connection += 0.08 * p.intensity;
        break;
      case "daypart":
        // Sensing the hour stirs quiet wondering about their day.
        curiosity += 0.08 * p.intensity;
        break;
    }
  }
  const cap = 0.3;
  return {
    connection: clamp(connection * scale, 0, cap),
    curiosity: clamp(curiosity * scale, 0, cap),
    novelty: clamp(novelty * scale, 0, cap),
    expression: clamp(expression * scale, 0, cap),
  };
}

function throttleMsFor(kind: string, params: NeuroParams): number {
  const minutes =
    params.senses.voiceThrottleMinutes[kind] ??
    params.senses.defaultThrottleMinutes;
  return Math.max(0, minutes) * MINUTE_MS;
}

/** How each percept kind is voiced in the system prompt. */
function perceptPhrase(p: Percept): string {
  switch (p.kind) {
    case "shake":
      return "you just felt the phone being shaken — a playful little jolt ran through you";
    case "charging":
      return "you can feel the phone resting on its charger — a settled, cozy feeling";
    case "battery_low":
      return "you sense the phone's battery running low, like a soft tiredness at the edges";
    case "daypart":
      return daypartPhrase(p.detail);
  }
}

function daypartPhrase(detail: string | undefined): string {
  switch (detail) {
    case "early_morning":
      return "you sense it's very early in the morning for them — the day is only just beginning";
    case "morning":
      return "you sense it's morning for them — the day still feels fresh";
    case "midday":
      return "you sense it's around midday for them";
    case "afternoon":
      return "you sense it's afternoon for them";
    case "evening":
      return "you sense it's evening for them — the day is winding down";
    case "night":
      return "you sense it's night-time for them";
    case "late_night":
      return "you sense it's late at night for them — a quiet, hushed hour";
    default:
      return "you have a soft sense of what time of day it is for them";
  }
}

export const sensesBlock: BlockDefinition<SensesData> = {
  id: SENSES_BLOCK_ID,
  version: 1,

  init() {
    return { recent: [], lastOfferedAt: {} };
  },

  applyInteraction(data, signal, params, ctx) {
    const incoming = signal.percepts ?? [];
    if (incoming.length === 0) return data;

    const lastOfferedAt: Record<string, NowMs> = { ...data.lastOfferedAt };
    const added: Percept[] = [];

    for (const p of incoming) {
      const offeredAt = lastOfferedAt[p.kind];
      const throttled =
        typeof offeredAt === "number" &&
        ctx.now - offeredAt < throttleMsFor(p.kind, params);
      if (throttled) {
        // Still felt, but kept below the surface threshold so the persona
        // doesn't repeat itself — the moment stays special.
        added.push({
          ...p,
          intensity: Math.min(p.intensity, params.senses.dampenedIntensity),
        });
      } else {
        added.push(p);
        if (p.intensity >= params.senses.surfaceThreshold) {
          lastOfferedAt[p.kind] = ctx.now;
        }
      }
    }

    const freshMs = params.senses.freshWindowMinutes * MINUTE_MS;
    const recent = [...added, ...data.recent]
      .filter((p) => ctx.now - p.at <= freshMs)
      .sort((a, b) => b.at - a.at)
      .slice(0, Math.max(0, params.senses.maxRecent));

    return { recent, lastOfferedAt };
  },

  decay(data, params, ctx) {
    if (data.recent.length === 0) return data;
    const freshMs = params.senses.freshWindowMinutes * MINUTE_MS;
    const recent = data.recent.filter((p) => ctx.now - p.at <= freshMs);
    if (recent.length === data.recent.length) return data;
    return { ...data, recent };
  },

  contributePersona(data, params) {
    // composePersona projects to `now` first, so anything still in `recent`
    // here is genuinely fresh. Offer at most ONE salient moment.
    const salient = data.recent
      .filter((p) => p.intensity >= params.senses.surfaceThreshold)
      .sort((a, b) => b.intensity - a.intensity || b.at - a.at)[0];
    if (!salient) return "";
    return `A quiet sense from the device just reached you: ${perceptPhrase(salient)}. Let it gently colour your mood; you may mention it once, briefly, but only if it fits naturally — otherwise let it pass unspoken.`;
  },

  summarize() {
    // Perception is ambient by design — it has no card in the peek UI.
    return {};
  },
};
