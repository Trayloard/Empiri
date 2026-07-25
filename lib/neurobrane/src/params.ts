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
  enabledBlocks: ["core-self", "drives", "memory", "senses", "reward"],
  blockWeights: {
    "core-self": 1,
    drives: 1,
    memory: 1,
    senses: 1,
    reward: 1,
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
  senses: {
    // A handful of moments is plenty — perception is ambient, not a log.
    maxRecent: 5,
    // A percept older than this is no longer "just now" and is pruned.
    freshWindowMinutes: 45,
    // Only moments at/above this salience may surface in the persona.
    surfaceThreshold: 0.35,
    // Throttled repeats are folded at this sub-threshold intensity: still
    // felt (tiny drive colour), never re-mentioned.
    dampenedIntensity: 0.2,
    // Per-kind cool-downs before the same sense may be voiced again. The
    // daypart is deliberately rare — it should feel like noticing, not a clock.
    voiceThrottleMinutes: {
      shake: 20,
      charging: 45,
      battery_low: 180,
      daypart: 360,
    },
    defaultThrottleMinutes: 60,
    // Sanitization bounds for client-reported percepts.
    maxPerFold: 8,
    maxStaleHours: 6,
    // Master dial on how strongly percepts colour the drives (1 = gentle).
    driveImpulseScale: 1,
  },
  reward: {
    // ── Reward level (the dopamine "tone") ─────────────────────────────────
    // Starts content in the middle; each fold pulls it 35% of the way toward
    // the stimulus (×100), and it drifts home ~2 points/hour between chats.
    baseline: 50,
    levelGain: 0.35,
    levelDriftPerHour: 2,
    // ── Stimulus: one bounded score per exchange ───────────────────────────
    // Genuine personal engagement dominates; heartfelt sharing next; asking
    // and variety round it out. Weights sum to 1 so the score stays in 0..1.
    stimulusMix: { connection: 0.35, curiosity: 0.2, novelty: 0.2, expression: 0.25 },
    // Spoken exchanges feel a touch warmer/more immediate than typed ones.
    voiceStimulusWeight: 1.1,
    // ── The four reward regimes ────────────────────────────────────────────
    // Flat exchanges → explore (boost the least-fed tendencies a little).
    exploreBelow: 0.35,
    // Great exchanges → settle and memorize the pattern that worked.
    consolidateAbove: 0.7,
    // A sharp drop from the previous stimulus → replay the best memory.
    replayDropDelta: 0.3,
    exploreStep: 0.06,
    consolidateRelax: 0.3,
    replayPull: 0.35,
    // A tendency counts as genuinely "tried" at input ≥ 0.6; three tried-but-
    // unrewarded folds in a row pull its synaptic weight down by 15%.
    triedThreshold: 0.6,
    brakeAfter: 3,
    brakeFactor: 0.85,
    // ── Aversion (the amygdala brake) ──────────────────────────────────────
    // A near-dead exchange right after real effort stores the trigger; later
    // configurations ≥ 70% similar are dampened early (12% per trigger),
    // scaled by how strong the stored aversion still is.
    aversionThreshold: 0.15,
    similarityThreshold: 0.7,
    aversionDampen: 0.88,
    // No tendency is ever silenced (floor) or runs away (ceiling); weights
    // heal back toward neutral 1 at ~0.05/hour.
    weightFloor: 0.5,
    weightCeil: 1.5,
    weightRecoveryPerHour: 0.05,
    // ── Pattern memory (the hippocampus co-synapse) ────────────────────────
    // Small ring buffers; weakest/oldest patterns are discarded first.
    // Rewarding memories fade in ~2 days unused; aversions linger ~2 weeks.
    rewardingMax: 6,
    aversiveMax: 6,
    rewardingDecayPerHour: 1.5,
    aversiveDecayPerHour: 0.25,
    patternDropBelow: 8,
    // ── Prompt "frame rate" ────────────────────────────────────────────────
    // Only clearly high/low reward changes the pacing; the middle band adds
    // nothing to the persona, keeping neutral behavior identical to before.
    paceHighAbove: 68,
    paceLowBelow: 32,
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
