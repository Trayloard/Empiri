import type { BlockDefinition, FactSummary } from "../types";
import { clamp, hoursBetween, round1 } from "../util";

/**
 * The memory block: Empiri's structured recall of durable personal facts the
 * user has shared ("Their dog is called Milo", "They have an exam on Aug 3").
 * Each fact lives in a stable key slot (e.g. "dog_name") with a salience that
 * grows when the fact is mentioned again and gently fades with time — so
 * recent, oft-confirmed facts surface in the persona while stale ones are
 * quietly forgotten. A new statement in an existing slot REPLACES the old text
 * (a new job overwrites the old one) instead of piling up contradictions.
 */

export const MEMORY_BLOCK_ID = "memory";

export interface Fact {
  /** Stable, normalized slot identifier — all matching/replacement keys on this. */
  key: string;
  /** The remembered statement, third-person ("Their dog is called Milo"). */
  text: string;
  /** How firmly the fact is held (0..100); decays, refreshes on mention. */
  salience: number;
  /** Epoch ms when the fact was last stated or confirmed. */
  lastConfirmedAt: number;
}

export interface MemoryData {
  facts: Fact[];
}

/**
 * Normalize a raw fact slot key into a stable, comparable identifier:
 * lowercase snake_case, alphanumerics only, bounded length. Both the server
 * sanitizer and the block itself run this, so "Dog Name", "dog-name" and
 * "dog_name" all land in the same slot no matter which extractor produced them.
 */
export function normalizeFactKey(raw: string): string {
  return raw
    .toLowerCase()
    .trim()
    .replace(/[\s-]+/g, "_")
    .replace(/[^\p{L}\p{N}_]/gu, "")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "")
    .slice(0, 40);
}

/** Starting salience for a freshly learned fact, scaled by confidence. */
function seedSalience(
  confidence: number,
  memory: { seedSalienceBase: number; seedSaliencePerConfidence: number },
): number {
  return memory.seedSalienceBase + memory.seedSaliencePerConfidence * clamp(confidence, 0, 1);
}

export const memoryBlock: BlockDefinition<MemoryData> = {
  id: MEMORY_BLOCK_ID,
  version: 1,

  init() {
    return { facts: [] };
  },

  applyInteraction(data, signal, params, ctx) {
    const candidates = signal.facts ?? [];
    if (candidates.length === 0) return data;

    const { min, max } = params.bounds;
    const memory = params.memory;
    const lr = params.learningRate * ctx.weight;
    const facts: Fact[] = data.facts.map((f) => ({ ...f }));

    for (const candidate of candidates) {
      const key = normalizeFactKey(candidate.key ?? "");
      const text = (candidate.text ?? "").trim();
      if (key.length < 2 || text.length === 0) continue;
      const confidence = clamp(candidate.confidence, 0, 1);
      if (confidence <= 0) continue;

      const seeded = clamp(seedSalience(confidence, memory) * lr, min, max);
      const existing = facts.find((f) => f.key === key);
      if (existing) {
        // Same slot: the newest statement wins (contradictions replace, and a
        // rephrased-but-equivalent statement is a harmless refresh). Salience
        // is boosted, and never lands below what a fresh fact would seed at.
        existing.text = text;
        existing.salience = clamp(
          Math.max(existing.salience + memory.refreshGain * confidence * lr, seeded),
          min,
          max,
        );
        existing.lastConfirmedAt = ctx.now;
      } else {
        facts.push({ key, text, salience: seeded, lastConfirmedAt: ctx.now });
      }
    }

    // Keep only the most salient facts.
    facts.sort((a, b) => b.salience - a.salience);
    return { facts: facts.slice(0, memory.maxCount) };
  },

  decay(data, params, ctx) {
    const hrs = hoursBetween(ctx.elapsedMs);
    if (hrs <= 0 || data.facts.length === 0) return data;
    const { min, max } = params.bounds;
    const lost = params.memory.decayPerHour * hrs;
    const facts = data.facts
      .map((f) => ({ ...f, salience: clamp(f.salience - lost, min, max) }))
      .filter((f) => f.salience >= params.memory.dropBelow);
    return { facts };
  },

  contributePersona(data, params) {
    const memory = params.memory;
    const surfaced = [...data.facts]
      .filter((f) => f.salience >= memory.surfaceThreshold)
      .sort((a, b) => b.salience - a.salience)
      .slice(0, memory.personaCount);
    if (surfaced.length === 0) return "";

    const lines = surfaced.map((f) => f.text.replace(/[.?!]+$/, ""));
    return `You genuinely remember these things they've told you (bring them up naturally when relevant, never like a database): ${lines.join(
      ". ",
    )}.`;
  },

  summarize(data) {
    const facts: FactSummary[] = [...data.facts]
      .sort((a, b) => b.salience - a.salience)
      .map((f) => ({ key: f.key, text: f.text, salience: round1(f.salience) }));
    return { facts };
  },
};
