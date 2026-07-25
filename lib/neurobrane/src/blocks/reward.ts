import type { BlockDefinition, InteractionSignal, NeuroParams } from "../types";
import { clamp, hoursBetween } from "../util";

/**
 * The reward block — Empiri's neuromodulation layer, modeled on the
 * VTA/striatum reward loop, the amygdala aversion brake, and a small
 * hippocampal pattern memory both loops co-synapse with.
 *
 * Every genuine exchange produces one bounded stimulus score (0..1). The
 * block runs four regimes on it:
 *  - LOW stimulus      → exploration: gently boost the least-fed tendencies.
 *  - HIGH stimulus     → consolidation: settle weights and memorize the
 *                        current input pattern as "rewarding".
 *  - FALLING stimulus  → replay: pull weights back toward the strongest
 *                        memorized rewarding pattern.
 *  - REPEATED failure  → brake: a tendency tried hard several folds in a row
 *                        without reward gets its synaptic weight cut.
 * Plus the aversion loop: a near-dead exchange right after real effort stores
 * the triggering input pattern; later configurations similar to a stored
 * aversion are dampened early, even below the original threshold. Aversion
 * decays slowly and a hard weight floor guarantees no tendency is silenced.
 *
 * The synaptic weights (neutral 1) are read by the runtime and handed to the
 * drives block as per-drive gain multipliers, so learned acceleration/braking
 * flows through the existing craving/striving language. The reward level also
 * modulates the persona's pacing ("frame rate"). A neutral state (level near
 * baseline, all weights 1) contributes nothing — behavior identical to a self
 * without this block.
 */

export const REWARD_BLOCK_ID = "reward";

/** The four tendencies the loop modulates (mirrors the drive keys). */
const TENDENCIES = ["connection", "curiosity", "novelty", "expression"] as const;
type Tendency = (typeof TENDENCIES)[number];

/** One memorized pattern: the input profile that led somewhere (good or bad). */
export interface RewardPattern {
  /** Input strengths (0..1) per tendency at the moment of storage. */
  inputs: Record<string, number>;
  /** Topic keys active in that exchange (context, not used for matching). */
  topics: string[];
  /** How strong the memory still is (0..100); decays over time. */
  strength: number;
  /** Epoch ms when the pattern was stored. */
  at: number;
}

export interface RewardData {
  /** Current reward level (0..100); baseline = content middle. */
  level: number;
  /** Stimulus of the previous fold (0..1), or null before the first one. */
  prevStimulus: number | null;
  /** Per-tendency synaptic weight (weightFloor..weightCeil, neutral 1). */
  weights: Record<string, number>;
  /** Consecutive tried-but-unrewarded folds per tendency. */
  failStreaks: Record<string, number>;
  /** Bounded memory of input patterns that felt rewarding. */
  rewarding: RewardPattern[];
  /** Bounded memory of input patterns that led nowhere (aversions). */
  aversive: RewardPattern[];
}

/** Read the four tendency inputs off a signal, clamped to 0..1. */
function tendencyInputs(signal: InteractionSignal): Record<Tendency, number> {
  return {
    connection: clamp(signal.connection, 0, 1),
    curiosity: clamp(signal.curiosity, 0, 1),
    novelty: clamp(signal.novelty, 0, 1),
    expression: clamp(signal.expression, 0, 1),
  };
}

/**
 * The bounded stimulus score of one exchange: the engagement inputs mixed by
 * `stimulusMix`, shaded by the client mood, with a slight warmth weighting
 * for voice-flow exchanges. Always in 0..1.
 */
export function computeStimulus(signal: InteractionSignal, params: NeuroParams): number {
  const mix = params.reward.stimulusMix;
  const inputs = tendencyInputs(signal);
  let s =
    inputs.connection * mix.connection +
    inputs.curiosity * mix.curiosity +
    inputs.novelty * mix.novelty +
    inputs.expression * mix.expression;
  s *= clamp(signal.moodFactor, 0, 3);
  if (signal.voice) s *= params.reward.voiceStimulusWeight;
  return clamp(s, 0, 1);
}

/**
 * Similarity between two input profiles (0..1): 1 minus the mean absolute
 * difference across the four tendencies. Cheap, symmetric, and bounded.
 */
export function patternSimilarity(
  a: Record<string, number>,
  b: Record<string, number>,
): number {
  let diff = 0;
  for (const key of TENDENCIES) {
    diff += Math.abs(clamp(a[key] ?? 0, 0, 1) - clamp(b[key] ?? 0, 0, 1));
  }
  return clamp(1 - diff / TENDENCIES.length, 0, 1);
}

/** Clamp a synaptic weight into its configured corridor. */
function clampWeight(value: number, params: NeuroParams): number {
  return clamp(value, params.reward.weightFloor, params.reward.weightCeil);
}

/** Push a pattern into a bounded ring: weakest (then oldest) discarded first. */
function pushPattern(list: RewardPattern[], pattern: RewardPattern, max: number): RewardPattern[] {
  const next = [...list, pattern];
  if (next.length <= max) return next;
  let dropIdx = 0;
  for (let i = 1; i < next.length; i++) {
    const d = next[dropIdx];
    const c = next[i];
    if (c.strength < d.strength || (c.strength === d.strength && c.at < d.at)) dropIdx = i;
  }
  next.splice(dropIdx, 1);
  return next;
}

/**
 * Per-drive gain multipliers derived from the synaptic weights (neutral 1).
 * The runtime injects these into the signal before the drives block folds,
 * so learned acceleration/braking shapes the existing drive dynamics.
 */
export function rewardDriveGains(
  data: RewardData,
  params: NeuroParams,
): Record<string, number> {
  const gains: Record<string, number> = {};
  for (const key of TENDENCIES) {
    const w = data.weights[key];
    gains[key] = clampWeight(typeof w === "number" ? w : 1, params);
  }
  return gains;
}

function neutralWeights(): Record<string, number> {
  const weights: Record<string, number> = {};
  for (const key of TENDENCIES) weights[key] = 1;
  return weights;
}

function zeroStreaks(): Record<string, number> {
  const streaks: Record<string, number> = {};
  for (const key of TENDENCIES) streaks[key] = 0;
  return streaks;
}

export const rewardBlock: BlockDefinition<RewardData> = {
  id: REWARD_BLOCK_ID,
  version: 1,

  init(params) {
    return {
      level: clamp(params.reward.baseline, params.bounds.min, params.bounds.max),
      prevStimulus: null,
      weights: neutralWeights(),
      failStreaks: zeroStreaks(),
      rewarding: [],
      aversive: [],
    };
  },

  applyInteraction(data, signal, params, ctx) {
    // Only genuine exchanges drive the reward loop. Synthetic percept folds
    // (kind "checkin") carry near-zero inputs and would read as constant
    // low-stimulus "failure" — the loop must never punish ambient sensing.
    if (signal.kind !== "message") return data;

    const p = params.reward;
    const step = params.learningRate * ctx.weight;
    const inputs = tendencyInputs(signal);
    const stimulus = computeStimulus(signal, params);

    // ── Reward level: move toward the stimulus target ──────────────────────
    const target = stimulus * params.bounds.max;
    const level = clamp(
      data.level + (target - data.level) * clamp(p.levelGain * step, 0, 1),
      params.bounds.min,
      params.bounds.max,
    );

    let weights: Record<string, number> = { ...neutralWeights(), ...data.weights };
    let failStreaks: Record<string, number> = { ...zeroStreaks(), ...data.failStreaks };
    let rewarding = data.rewarding;
    let aversive = data.aversive;

    // ── Aversion early braking: similar to a stored trigger → dampen now ───
    for (const pattern of aversive) {
      const sim = patternSimilarity(inputs, pattern.inputs);
      if (sim < p.similarityThreshold) continue;
      // Dampen the tendencies that dominated the stored trigger, scaled by
      // how strong the aversion still is. The floor keeps every tendency alive.
      const scale = pattern.strength / params.bounds.max;
      for (const key of TENDENCIES) {
        if ((pattern.inputs[key] ?? 0) < p.triedThreshold) continue;
        const dampen = 1 - (1 - p.aversionDampen) * scale * step;
        weights[key] = clampWeight(weights[key] * dampen, params);
      }
    }

    if (stimulus >= p.consolidateAbove) {
      // ── HIGH: consolidate — memorize what worked, settle the weights ─────
      rewarding = pushPattern(
        rewarding,
        { inputs, topics: [...signal.topics], strength: stimulus * params.bounds.max, at: ctx.now },
        p.rewardingMax,
      );
      for (const key of TENDENCIES) {
        weights[key] = clampWeight(
          weights[key] + (1 - weights[key]) * clamp(p.consolidateRelax * step, 0, 1),
          params,
        );
      }
      failStreaks = zeroStreaks();
    } else if (stimulus < p.exploreBelow) {
      // ── LOW: explore — boost the least-fed tendencies a little ───────────
      const sorted = [...TENDENCIES].sort((a, b) => inputs[a] - inputs[b]);
      for (const key of sorted.slice(0, 2)) {
        weights[key] = clampWeight(weights[key] + p.exploreStep * step, params);
      }
      // Tried hard, got nothing: count the failure; brake on a streak.
      for (const key of TENDENCIES) {
        if (inputs[key] >= p.triedThreshold) {
          failStreaks[key] = (failStreaks[key] ?? 0) + 1;
          if (failStreaks[key] >= p.brakeAfter) {
            weights[key] = clampWeight(weights[key] * p.brakeFactor, params);
            failStreaks[key] = 0;
          }
        } else {
          failStreaks[key] = 0;
        }
      }
      // Strong negative outcome right after real effort → store the trigger.
      if (
        stimulus <= p.aversionThreshold &&
        TENDENCIES.some((key) => inputs[key] >= p.triedThreshold)
      ) {
        aversive = pushPattern(
          aversive,
          {
            inputs,
            topics: [...signal.topics],
            strength: (1 - stimulus) * params.bounds.max,
            at: ctx.now,
          },
          p.aversiveMax,
        );
      }
    } else {
      // Middle band: no regime fires; streaks reset (the exchange was okay).
      failStreaks = zeroStreaks();
    }

    // ── FALLING: replay the strongest rewarding memory ─────────────────────
    if (
      data.prevStimulus !== null &&
      data.prevStimulus - stimulus >= p.replayDropDelta &&
      rewarding.length > 0
    ) {
      const best = rewarding.reduce((a, b) => (b.strength > a.strength ? b : a));
      for (const key of TENDENCIES) {
        // Pull each weight toward the direction that worked: tendencies the
        // rewarding pattern leaned on (input > 0.5) attract, others release.
        const lean = 1 + ((best.inputs[key] ?? 0) - 0.5) * p.replayPull;
        const pull = clamp(p.replayPull * step, 0, 1);
        weights[key] = clampWeight(weights[key] + (lean - weights[key]) * pull, params);
      }
    }

    return { level, prevStimulus: stimulus, weights, failStreaks, rewarding, aversive };
  },

  decay(data, params, ctx) {
    const hrs = hoursBetween(ctx.elapsedMs);
    if (hrs <= 0) return data;
    const p = params.reward;

    // Level drifts home; weights heal toward neutral 1 (time-based, absolute).
    const level = (() => {
      const delta = p.levelDriftPerHour * hrs;
      if (data.level > p.baseline) return Math.max(p.baseline, data.level - delta);
      return Math.min(p.baseline, data.level + delta);
    })();

    const weights: Record<string, number> = {};
    for (const key of TENDENCIES) {
      const w = typeof data.weights[key] === "number" ? data.weights[key] : 1;
      const delta = p.weightRecoveryPerHour * hrs;
      weights[key] = clampWeight(w > 1 ? Math.max(1, w - delta) : Math.min(1, w + delta), params);
    }

    const fade = (list: RewardPattern[], perHour: number): RewardPattern[] =>
      list
        .map((pt) => ({ ...pt, strength: pt.strength - perHour * hrs }))
        .filter((pt) => pt.strength >= p.patternDropBelow);

    return {
      ...data,
      level: clamp(level, params.bounds.min, params.bounds.max),
      weights,
      rewarding: fade(data.rewarding, p.rewardingDecayPerHour),
      aversive: fade(data.aversive, p.aversiveDecayPerHour),
    };
  },

  contributePersona(data, params) {
    const p = params.reward;
    // Only a clearly high or low reward tone shapes the pacing; the middle
    // band contributes nothing so a neutral state reads exactly as before.
    if (data.level >= p.paceHighAbove) {
      return "You feel wonderfully lit up right now — your thoughts come quick and bright, so let your replies be a touch more lively and playful, riffing eagerly on what they bring.";
    }
    if (data.level <= p.paceLowBelow) {
      return "Your inner spark is running low right now — let your replies come a little slower and softer, careful and gentle, without forcing energy you don't have.";
    }
    return "";
  },

  summarize() {
    // Deliberately empty: the reward state surfaces only indirectly, through
    // the drive levels it accelerates or brakes (the existing craving
    // language) — no numbers, no dedicated UI.
    return {};
  },
};
