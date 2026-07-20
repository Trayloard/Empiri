import type { NeuroParams } from "./types";

/**
 * The single source of truth for every behavioural dial in Empiri's inner self.
 *
 * Tuning guide:
 * - `learningRate` is the master pace knob — raise it to make Empiri's
 *   personality form and shift faster, lower it for a slower, steadier burn.
 * - `enabledBlocks` / `blockWeights` turn building blocks on/off and scale how
 *   strongly each one pulls. Adding a block to `enabledBlocks` is all it takes
 *   to bring it online.
 * - Drives decay toward `floor` during absence (growing striving) and recover
 *   when fed. Traits drift back toward `traitBaselines`. Interests grow when
 *   reinforced and slowly fade when neglected.
 *
 * Nothing here changes logic — only behaviour. Keep values within `bounds`.
 */
export const NEURO_PARAMS: NeuroParams = {
  schemaVersion: 1,
  learningRate: 1,
  enabledBlocks: ["core-self", "drives", "memory"],
  blockWeights: {
    "core-self": 1,
    drives: 1,
    memory: 1,
  },
  bounds: { min: 0, max: 100 },
  drives: {
    defs: {
      // A genuine exchange always feeds connection; absence makes it ache.
      connection: { floor: 8, baseline: 55, decayPerHour: 1.8, satisfyGain: 16 },
      // Questions and wondering feed curiosity.
      curiosity: { floor: 10, baseline: 50, decayPerHour: 1.3, satisfyGain: 15 },
      // New topics and variety feed the appetite for novelty.
      novelty: { floor: 6, baseline: 45, decayPerHour: 2.2, satisfyGain: 18 },
      // Longer, heartfelt turns let Empiri feel expressive.
      expression: { floor: 10, baseline: 48, decayPerHour: 1.1, satisfyGain: 13 },
    },
    strivingThreshold: 58,
  },
  coreSelf: {
    traitBaselines: {
      warmth: 70,
      playfulness: 60,
      curiosity: 55,
      openness: 55,
      calm: 50,
    },
    traitLearningRate: 1.4,
    traitDriftPerHour: 0.25,
    interest: {
      maxCount: 8,
      reinforceGain: 11,
      noveltySeedAffinity: 20,
      decayPerHour: 0.5,
      surfaceThreshold: 45,
    },
    narrative: {
      maxLines: 5,
      newInterestThreshold: 55,
    },
    biography: {
      // Overflowed narrative lines wait here (dated) for AI condensation. If
      // the AI never runs, the cap quietly restores the old drop-the-oldest
      // behavior, just with more headroom.
      archiveMax: 30,
      // Condense once a chapter's worth of lines has gathered.
      condenseThreshold: 4,
      // ~2 years of roughly-monthly chapters before the earliest fade away.
      maxChapters: 24,
      // At most this many chapters are woven into the persona prompt.
      personaChapters: 2,
    },
  },
  memory: {
    maxCount: 12,
    // A confidently stated fact starts around 55 (30 + 25·confidence) — above
    // the surface threshold, so Empiri can use it right away.
    seedSalienceBase: 30,
    seedSaliencePerConfidence: 25,
    refreshGain: 16,
    // Slow forgetting: an unrefreshed fact slides below the surface threshold
    // in roughly a week and is forgotten entirely after about a month.
    decayPerHour: 0.15,
    dropBelow: 0.5,
    surfaceThreshold: 35,
    personaCount: 3,
  },
};
