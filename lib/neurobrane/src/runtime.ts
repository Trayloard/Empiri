import type {
  BlockEnvelope,
  InnerSelf,
  InteractionSignal,
  NeuroParams,
  SelfSeed,
  SelfSummary,
} from "./types";
import { NEURO_PARAMS } from "./params";
import { enabledBlocks } from "./blocks/registry";
import { clamp, extractTopicsDetailed, round1 } from "./util";
import { BASE_IDENTITY, INNER_HEADER, STYLE_RULES } from "./persona";

const HOUR_MS = 3_600_000;

/** Create a brand-new inner self, optionally biased by a head-start seed. */
export function createSelf(
  params: NeuroParams = NEURO_PARAMS,
  seed?: SelfSeed,
  now: number = Date.now(),
): InnerSelf {
  const blocks: Record<string, BlockEnvelope> = {};
  for (const block of enabledBlocks(params)) {
    blocks[block.id] = {
      version: block.version,
      lastUpdatedAt: now,
      data: block.init(params, seed),
    };
  }
  return { schemaVersion: params.schemaVersion, createdAt: now, interactions: 0, blocks };
}

/**
 * Rebuild a valid inner self from whatever was persisted. Tolerant by design:
 * unknown block keys are preserved untouched, enabled-but-missing blocks are
 * initialized, and anything malformed falls back to a fresh self. This is what
 * lets you enable/disable/add blocks purely through config.
 */
export function hydrate(
  raw: unknown,
  params: NeuroParams = NEURO_PARAMS,
  now: number = Date.now(),
): InnerSelf {
  if (!raw || typeof raw !== "object") return createSelf(params, undefined, now);
  const candidate = raw as Partial<InnerSelf>;
  const sourceBlocks =
    candidate.blocks && typeof candidate.blocks === "object" ? candidate.blocks : {};
  const blocks: Record<string, BlockEnvelope> = { ...sourceBlocks };

  for (const block of enabledBlocks(params)) {
    const env = blocks[block.id];
    const valid = env && typeof env === "object" && (env as BlockEnvelope).data != null;
    if (!valid) {
      blocks[block.id] = {
        version: block.version,
        lastUpdatedAt: now,
        data: block.init(params),
      };
    }
  }

  return {
    schemaVersion:
      typeof candidate.schemaVersion === "number" ? candidate.schemaVersion : params.schemaVersion,
    createdAt: typeof candidate.createdAt === "number" ? candidate.createdAt : now,
    interactions: typeof candidate.interactions === "number" ? candidate.interactions : 0,
    blocks,
  };
}

/** Apply lazy time-decay up to `now` without folding in an interaction. */
export function project(
  self: InnerSelf,
  params: NeuroParams = NEURO_PARAMS,
  now: number = Date.now(),
): InnerSelf {
  const blocks: Record<string, BlockEnvelope> = { ...self.blocks };
  for (const block of enabledBlocks(params)) {
    const env = blocks[block.id];
    if (!env) continue;
    const elapsedMs = now - env.lastUpdatedAt;
    if (elapsedMs <= 0) continue;
    const weight = params.blockWeights[block.id] ?? 1;
    const data = block.decay(env.data, params, { now, elapsedMs, weight });
    blocks[block.id] = { version: block.version, lastUpdatedAt: now, data };
  }
  return { ...self, blocks };
}

/** Decay to `now`, then fold one interaction into every enabled block. */
export function evolve(
  self: InnerSelf,
  signal: InteractionSignal,
  params: NeuroParams = NEURO_PARAMS,
  now: number = Date.now(),
): InnerSelf {
  const decayed = project(self, params, now);
  const blocks: Record<string, BlockEnvelope> = { ...decayed.blocks };
  for (const block of enabledBlocks(params)) {
    const env = blocks[block.id];
    if (!env) continue;
    const weight = params.blockWeights[block.id] ?? 1;
    const data = block.applyInteraction(env.data, signal, params, {
      now,
      elapsedMs: 0,
      weight,
    });
    blocks[block.id] = { version: block.version, lastUpdatedAt: now, data };
  }
  return { ...decayed, blocks, interactions: decayed.interactions + 1 };
}

/**
 * Build the full system prompt from the current (time-projected) inner self.
 * The identity and style scaffolding are constant; only the middle "inner
 * state" section reflects who Empiri is right now.
 */
export function composePersona(
  self: InnerSelf,
  params: NeuroParams = NEURO_PARAMS,
  now: number = Date.now(),
): string {
  const projected = project(self, params, now);
  const fragments: string[] = [];
  for (const block of enabledBlocks(params)) {
    const env = projected.blocks[block.id];
    if (!env) continue;
    const fragment = block.contributePersona(env.data, params).trim();
    if (fragment) fragments.push(fragment);
  }
  const sections = [BASE_IDENTITY];
  if (fragments.length > 0) sections.push(`${INNER_HEADER}\n${fragments.join(" ")}`);
  sections.push(STYLE_RULES);
  return sections.join("\n\n");
}

/** A friendly, read-only view of the inner self for the peek UI. */
export function summarizeSelf(
  self: InnerSelf,
  params: NeuroParams = NEURO_PARAMS,
  now: number = Date.now(),
): SelfSummary {
  const projected = project(self, params, now);
  const summary: SelfSummary = {
    drives: [],
    traits: [],
    interests: [],
    narrative: [],
    facts: [],
    chapters: [],
    interactions: projected.interactions,
    ageHours: round1(Math.max(0, (now - projected.createdAt) / HOUR_MS)),
  };
  for (const block of enabledBlocks(params)) {
    const env = projected.blocks[block.id];
    if (!env) continue;
    const part = block.summarize(env.data, params);
    if (part.drives) summary.drives.push(...part.drives);
    if (part.traits) summary.traits.push(...part.traits);
    if (part.interests) summary.interests.push(...part.interests);
    if (part.narrative) summary.narrative.push(...part.narrative);
    if (part.facts) summary.facts.push(...part.facts);
    if (part.chapters) summary.chapters.push(...part.chapters);
  }
  return summary;
}

/**
 * Derive a normalized interaction signal from a user's message. Heuristic but
 * deterministic — it decides how much the turn feeds each drive and which
 * topics to grow interests from. `moodFactor` lets the caller modulate reward
 * magnitude (e.g. from the client's mood); defaults to neutral.
 */
export function deriveMessageSignal(text: string, moodFactor = 1): InteractionSignal {
  const trimmed = (text ?? "").trim();
  const length = trimmed.length;
  const lower = trimmed.toLowerCase();
  const isQuestion =
    /\?/.test(trimmed) ||
    /^(who|what|when|where|why|how|do|does|did|can|could|would|is|are|tell me|wer|was|wann|wo|warum|wie|kannst|erzähl)/.test(
      lower,
    );
  const words = lower.split(/\s+/).filter(Boolean);
  const uniqueWords = new Set(words).size;
  const novelty = clamp(uniqueWords / 12, 0, 1);

  const detailed = extractTopicsDetailed(trimmed, 2);

  return {
    kind: "message",
    connection: 1,
    curiosity: isQuestion ? 1 : clamp(0.3 + novelty * 0.4, 0, 1),
    novelty,
    expression: clamp(length / 200, 0, 1),
    topics: detailed.map((t) => t.key),
    topicDisplays: Object.fromEntries(detailed.map((t) => [t.key, t.display])),
    moodFactor: clamp(moodFactor, 0, 3),
  };
}
