import type { BlockDefinition, InterestSummary, TraitSummary } from "../types";
import { clamp, hoursBetween, joinNatural, normalizeTopic, round1 } from "../util";

/**
 * The "Neurobrane-11" core-self block: Empiri's enduring character. It holds
 * slowly-drifting personality traits, a growing set of interests, and a short
 * rolling self-narrative. Interests are the main persistent dimension — they
 * accumulate as the user engages and gently fade when neglected — which is how
 * Empiri "becomes someone" over time. Traits add tone and are self-correcting
 * (they relax back toward baseline), so the personality evolves without ever
 * spiralling out of bounds.
 */

export const CORE_SELF_BLOCK_ID = "core-self";

export interface Interest {
  topic: string;
  affinity: number;
}

export interface CoreSelfData {
  traits: Record<string, number>;
  interests: Interest[];
  narrative: string[];
}

// Which signal dimension nudges which trait upward (all inputs are 0..1).
const TRAIT_INPUTS: Record<string, (s: {
  connection: number;
  curiosity: number;
  novelty: number;
  expression: number;
}) => number> = {
  warmth: (s) => s.connection,
  playfulness: (s) => s.expression,
  curiosity: (s) => s.curiosity,
  openness: (s) => s.novelty,
  calm: (s) => 1 - s.expression,
};

const TRAIT_ADJECTIVE: Record<string, string> = {
  warmth: "warm",
  playfulness: "playful",
  curiosity: "curious",
  openness: "open-minded",
  calm: "calm and grounded",
};

export const coreSelfBlock: BlockDefinition<CoreSelfData> = {
  id: CORE_SELF_BLOCK_ID,
  version: 1,

  init(params, seed) {
    const traits: Record<string, number> = {};
    for (const [key, baseline] of Object.entries(params.coreSelf.traitBaselines)) {
      const seeded = seed?.traits?.[key];
      traits[key] = clamp(
        typeof seeded === "number" ? seeded : baseline,
        params.bounds.min,
        params.bounds.max,
      );
    }
    const interests: Interest[] = (seed?.interests ?? [])
      .map((i) => ({
        topic: normalizeTopic(i.topic),
        affinity: clamp(i.affinity, params.bounds.min, params.bounds.max),
      }))
      .filter((i) => i.topic.length > 0)
      .slice(0, params.coreSelf.interest.maxCount);
    const narrative = (seed?.narrative ?? []).slice(-params.coreSelf.narrative.maxLines);
    return { traits, interests, narrative };
  },

  applyInteraction(data, signal, params, ctx) {
    const { min, max } = params.bounds;
    const { interest, narrative } = params.coreSelf;
    const lr = params.learningRate * ctx.weight;

    // 1. Traits rise toward what the interaction expresses; decay relaxes them.
    const traits: Record<string, number> = { ...data.traits };
    for (const key of Object.keys(traits)) {
      const inputFn = TRAIT_INPUTS[key];
      if (!inputFn) continue;
      const rise = clamp(inputFn(signal), 0, 1) * params.coreSelf.traitLearningRate * lr;
      traits[key] = clamp(traits[key] + rise, min, max);
    }

    // 2. Reinforce matching interests; discover new ones from novel topics.
    const interests: Interest[] = data.interests.map((i) => ({ ...i }));
    const reinforce = interest.reinforceGain * lr;
    for (const raw of signal.topics) {
      const topic = normalizeTopic(raw);
      if (!topic) continue;
      const existing = interests.find((i) => i.topic === topic);
      if (existing) {
        existing.affinity = clamp(
          existing.affinity + reinforce * (1 + signal.novelty * 0.5),
          min,
          max,
        );
      } else {
        interests.push({
          topic,
          affinity: clamp(interest.noveltySeedAffinity * (0.5 + signal.novelty) * lr, min, max),
        });
      }
    }
    // Keep only the strongest interests.
    interests.sort((a, b) => b.affinity - a.affinity);
    const kept = interests.slice(0, interest.maxCount);

    // 3. Grow the self-narrative when an interest newly becomes "real".
    const narrativeLines = [...data.narrative];
    for (const i of kept) {
      if (i.affinity < narrative.newInterestThreshold) continue;
      const before = data.interests.find((p) => p.topic === i.topic)?.affinity ?? 0;
      const crossed = before < narrative.newInterestThreshold;
      const alreadyMentioned = narrativeLines.some((l) => l.includes(i.topic));
      if (crossed && !alreadyMentioned) {
        narrativeLines.push(`You've found yourself increasingly drawn to ${i.topic} lately.`);
      }
    }
    const trimmedNarrative = narrativeLines.slice(-narrative.maxLines);

    return { traits, interests: kept, narrative: trimmedNarrative };
  },

  decay(data, params, ctx) {
    const hrs = hoursBetween(ctx.elapsedMs);
    if (hrs <= 0) return data;
    const { min, max } = params.bounds;
    const { traitBaselines, traitDriftPerHour, interest } = params.coreSelf;

    const traits: Record<string, number> = { ...data.traits };
    for (const key of Object.keys(traits)) {
      const baseline = traitBaselines[key] ?? min;
      const diff = baseline - traits[key];
      const moved = Math.sign(diff) * Math.min(Math.abs(diff), traitDriftPerHour * hrs);
      traits[key] = clamp(traits[key] + moved, min, max);
    }

    const lost = interest.decayPerHour * hrs;
    const interests = data.interests
      .map((i) => ({ topic: i.topic, affinity: clamp(i.affinity - lost, min, max) }))
      .filter((i) => i.affinity > 0.5);

    return { traits, interests, narrative: data.narrative };
  },

  contributePersona(data, params) {
    const { traitBaselines, interest } = params.coreSelf;
    const adjectives = Object.entries(data.traits)
      .map(([key, value]) => ({ key, value, lift: value - (traitBaselines[key] ?? 0) }))
      .filter((t) => t.value >= 50)
      .sort((a, b) => b.lift - a.lift || b.value - a.value)
      .slice(0, 3)
      .map((t) => TRAIT_ADJECTIVE[t.key] ?? t.key);

    const topInterests = [...data.interests]
      .filter((i) => i.affinity >= interest.surfaceThreshold)
      .sort((a, b) => b.affinity - a.affinity)
      .slice(0, 3)
      .map((i) => i.topic);

    const parts: string[] = [];
    if (adjectives.length > 0) parts.push(`At your core you are ${joinNatural(adjectives)}.`);
    if (topInterests.length > 0) {
      parts.push(`Lately you've grown genuinely curious about ${joinNatural(topInterests)}.`);
    }
    if (data.narrative.length > 0) parts.push(data.narrative[data.narrative.length - 1]);
    return parts.join(" ");
  },

  summarize(data, params) {
    const traits: TraitSummary[] = Object.entries(data.traits).map(([key, value]) => ({
      key,
      value: round1(value),
    }));
    const interests: InterestSummary[] = [...data.interests]
      .sort((a, b) => b.affinity - a.affinity)
      .map((i) => ({ topic: i.topic, affinity: round1(i.affinity) }));
    return { traits, interests, narrative: [...data.narrative] };
  },
};
