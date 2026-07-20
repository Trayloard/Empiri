import type {
  BlockDefinition,
  ChapterSummary,
  InterestSummary,
  NeuroParams,
  TraitSummary,
} from "../types";
import {
  clamp,
  hoursBetween,
  joinNatural,
  normalizeTopic,
  preferredDisplay,
  round1,
} from "../util";

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
  /** Normalized, lowercased key — all matching/dedup/decay key on this. */
  topic: string;
  affinity: number;
  /** Best original casing for the topic (proper-noun aware), for display. */
  display?: string;
}

/** A narrative line that overflowed the rolling window, dated for condensation. */
export interface ArchivedLine {
  text: string;
  /** Epoch ms when the line slid out of the rolling narrative (drop time, not creation time). */
  at: number;
}

/** A condensed, dated chapter of the shared story ("Back in July you…"). */
export interface Chapter {
  /** Epoch ms of the earliest moment the chapter covers. */
  from: number;
  /** Epoch ms of the latest moment the chapter covers. */
  to: number;
  /** The condensed chapter text, second person, matching the narrative voice. */
  text: string;
  /** Core themes of the period (normalized topic keys). */
  themes: string[];
}

export interface CoreSelfData {
  traits: Record<string, number>;
  interests: Interest[];
  narrative: string[];
  /** Overflowed narrative lines awaiting AI condensation into a chapter. */
  archive: ArchivedLine[];
  /** The condensed life story so far, oldest chapter first. */
  chapters: Chapter[];
}

/**
 * Defensive normalization for persisted states that predate the biography
 * fields (hydrate() only checks that block data exists, not its shape).
 * Missing fields become empty — a lossless migration.
 */
export function normalizeCoreSelf(data: Partial<CoreSelfData> | CoreSelfData): CoreSelfData {
  return {
    traits: data.traits ?? {},
    interests: data.interests ?? [],
    narrative: data.narrative ?? [],
    archive: Array.isArray(data.archive) ? data.archive : [],
    chapters: Array.isArray(data.chapters) ? data.chapters : [],
  };
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
        display: preferredDisplay(undefined, i.topic),
      }))
      .filter((i) => i.topic.length > 0)
      .slice(0, params.coreSelf.interest.maxCount);
    const narrative = (seed?.narrative ?? []).slice(-params.coreSelf.narrative.maxLines);
    return { traits, interests, narrative, archive: [], chapters: [] };
  },

  applyInteraction(rawData, signal, params, ctx) {
    const data = normalizeCoreSelf(rawData);
    const { min, max } = params.bounds;
    const { interest, narrative, biography } = params.coreSelf;
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
      // Richer extractors can weight topics by how central they are to the
      // message; unweighted topics keep full strength (heuristic behaviour).
      const topicWeight = clamp(signal.topicWeights?.[topic] ?? 1, 0, 1);
      if (topicWeight <= 0) continue;
      // Display casing rides a separate channel; matching stays on the key, so
      // "Paris" and "paris" reinforce the SAME interest, keeping the best casing.
      const display = signal.topicDisplays?.[topic] ?? raw;
      const existing = interests.find((i) => i.topic === topic);
      if (existing) {
        existing.affinity = clamp(
          existing.affinity + reinforce * (1 + signal.novelty * 0.5) * topicWeight,
          min,
          max,
        );
        existing.display = preferredDisplay(existing.display, display);
      } else {
        interests.push({
          topic,
          affinity: clamp(
            interest.noveltySeedAffinity * (0.5 + signal.novelty) * lr * topicWeight,
            min,
            max,
          ),
          display: preferredDisplay(undefined, display),
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
    // Lines that slide out of the rolling window are archived (dated) instead
    // of silently dropped — they wait for AI condensation into a chapter. The
    // archive itself is capped so storage stays bounded even without AI.
    const overflowCount = Math.max(0, narrativeLines.length - narrative.maxLines);
    const overflowed = narrativeLines
      .slice(0, overflowCount)
      .map((text) => ({ text, at: ctx.now }));
    const archive = [...data.archive, ...overflowed].slice(-biography.archiveMax);
    const trimmedNarrative = narrativeLines.slice(-narrative.maxLines);

    return {
      traits,
      interests: kept,
      narrative: trimmedNarrative,
      archive,
      chapters: data.chapters,
    };
  },

  decay(rawData, params, ctx) {
    const data = normalizeCoreSelf(rawData);
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
      .map((i) => ({ ...i, affinity: clamp(i.affinity - lost, min, max) }))
      .filter((i) => i.affinity > 0.5);

    return {
      traits,
      interests,
      narrative: data.narrative,
      archive: data.archive,
      chapters: data.chapters,
    };
  },

  contributePersona(rawData, params) {
    const data = normalizeCoreSelf(rawData);
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

    // A whisper of the longer story: the most recent chapter, plus at most one
    // older chapter that still resonates with a current surfaced interest.
    // Strictly capped so the prompt never bloats as chapters accumulate.
    const chosen = selectPersonaChapters(data, params);
    if (chosen.length > 0) {
      const lines = chosen.map((c) => c.text.replace(/[.?!]+$/, ""));
      parts.push(
        `Earlier chapters of your story together (you may gently reference them, like an old friend would): ${lines.join(". ")}.`,
      );
    }
    return parts.join(" ");
  },

  summarize(rawData, params) {
    const data = normalizeCoreSelf(rawData);
    const traits: TraitSummary[] = Object.entries(data.traits).map(([key, value]) => ({
      key,
      value: round1(value),
    }));
    const interests: InterestSummary[] = [...data.interests]
      .sort((a, b) => b.affinity - a.affinity)
      .map((i) => ({
        topic: i.topic,
        affinity: round1(i.affinity),
        display: i.display ?? i.topic,
      }));
    const chapters: ChapterSummary[] = [...data.chapters]
      .sort((a, b) => a.from - b.from)
      .map((c) => ({ from: c.from, to: c.to, text: c.text, themes: [...c.themes] }));
    return { traits, interests, narrative: [...data.narrative], chapters };
  },
};

/**
 * Pick which chapters the persona may reference: always the most recent one,
 * plus older chapters whose themes overlap a currently surfaced interest (the
 * "salience" proxy — the past that still echoes in the present), newest first,
 * capped at params.coreSelf.biography.personaChapters.
 */
export function selectPersonaChapters(data: CoreSelfData, params: NeuroParams): Chapter[] {
  const { biography, interest } = params.coreSelf;
  if (data.chapters.length === 0 || biography.personaChapters <= 0) return [];

  const byRecency = [...data.chapters].sort((a, b) => b.to - a.to);
  const surfaced = new Set(
    data.interests.filter((i) => i.affinity >= interest.surfaceThreshold).map((i) => i.topic),
  );

  const chosen: Chapter[] = [byRecency[0]];
  for (const chapter of byRecency.slice(1)) {
    if (chosen.length >= biography.personaChapters) break;
    if (chapter.themes.some((t) => surfaced.has(t))) chosen.push(chapter);
  }
  // Tell the story oldest-first so "back then → more recently" reads naturally.
  return chosen.sort((a, b) => a.from - b.from);
}
