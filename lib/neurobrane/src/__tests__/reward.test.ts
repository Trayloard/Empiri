import { describe, expect, it } from "vitest";

import {
  computeStimulus,
  createSelf,
  evolve,
  hydrate,
  NEURO_PARAMS,
  patternSimilarity,
  project,
  rewardBlock,
  rewardDriveGains,
  REWARD_BLOCK_ID,
  type InnerSelf,
  type InteractionSignal,
  type RewardData,
} from "../index";

const T0 = 1_700_000_000_000;
const HOUR = 3_600_000;
const P = NEURO_PARAMS;

function rewardData(self: InnerSelf): RewardData {
  return self.blocks[REWARD_BLOCK_ID]!.data as RewardData;
}

function signal(
  overrides: Partial<InteractionSignal> = {},
): InteractionSignal {
  return {
    kind: "message",
    connection: 0.5,
    curiosity: 0.5,
    novelty: 0.5,
    expression: 0.5,
    topics: [],
    moodFactor: 1,
    ...overrides,
  };
}

const richSignal = signal({
  connection: 0.9,
  curiosity: 0.8,
  novelty: 0.8,
  expression: 0.9,
});

const flatSignal = signal({
  connection: 0.1,
  curiosity: 0.1,
  novelty: 0.1,
  expression: 0.1,
});

// High effort, dead outcome: the aversion trigger shape.
const burnedSignal = signal({
  connection: 0.9,
  curiosity: 0.1,
  novelty: 0.1,
  expression: 0.1,
  moodFactor: 0.2,
});

describe("computeStimulus", () => {
  it("is bounded 0..1 and monotone with engagement", () => {
    expect(computeStimulus(flatSignal, P)).toBeGreaterThanOrEqual(0);
    expect(computeStimulus(richSignal, P)).toBeLessThanOrEqual(1);
    expect(computeStimulus(richSignal, P)).toBeGreaterThan(
      computeStimulus(flatSignal, P),
    );
  });

  it("weights voice-flow exchanges slightly warmer via the params constant", () => {
    const typed = computeStimulus(signal(), P);
    const spoken = computeStimulus(signal({ voice: true }), P);
    expect(spoken).toBeCloseTo(
      Math.min(1, typed * P.reward.voiceStimulusWeight),
      10,
    );
    expect(spoken).toBeGreaterThan(typed);
  });
});

describe("patternSimilarity", () => {
  it("is 1 for identical profiles and lower for different ones", () => {
    const a = { connection: 0.9, curiosity: 0.1, novelty: 0.1, expression: 0.1 };
    const b = { connection: 0.1, curiosity: 0.9, novelty: 0.9, expression: 0.9 };
    expect(patternSimilarity(a, a)).toBe(1);
    expect(patternSimilarity(a, b)).toBeLessThan(0.5);
  });
});

describe("reward regimes", () => {
  const ctx = { now: T0, elapsedMs: 0, weight: 1 };

  it("consolidates on high stimulus: memorizes the pattern and settles weights toward 1", () => {
    let data = rewardBlock.init(P);
    data = { ...data, weights: { ...data.weights, connection: 0.7 } };
    const next = rewardBlock.applyInteraction(data, richSignal, P, ctx);
    expect(next.rewarding.length).toBe(1);
    expect(next.weights.connection).toBeGreaterThan(0.7);
    expect(next.level).toBeGreaterThan(data.level);
  });

  it("explores on low stimulus: boosts the least-fed tendencies", () => {
    const data = rewardBlock.init(P);
    const next = rewardBlock.applyInteraction(data, flatSignal, P, ctx);
    const boosted = Object.values(next.weights).filter((w) => w > 1).length;
    expect(boosted).toBe(2);
    expect(Object.values(next.weights).every((w) => w <= P.reward.weightCeil)).toBe(true);
  });

  it("brakes a tendency after repeated tried-but-unrewarded folds", () => {
    let data = rewardBlock.init(P);
    for (let i = 0; i < P.reward.brakeAfter; i++) {
      data = rewardBlock.applyInteraction(data, burnedSignal, P, ctx);
    }
    expect(data.weights.connection).toBeLessThan(1);
    expect(data.failStreaks.connection).toBe(0); // reset after the brake fired
  });

  it("replays the best rewarding memory after a sharp stimulus drop", () => {
    let data = rewardBlock.init(P);
    data = rewardBlock.applyInteraction(data, richSignal, P, ctx); // stores pattern, high prevStimulus
    const midFlat = signal({
      connection: 0.2,
      curiosity: 0.2,
      novelty: 0.2,
      expression: 0.2,
      moodFactor: 1.4,
    });
    // Ensure the drop from prevStimulus is big enough to trigger replay.
    expect(data.prevStimulus! - computeStimulus(midFlat, P)).toBeGreaterThanOrEqual(
      P.reward.replayDropDelta,
    );
    const before = data.weights.connection;
    const next = rewardBlock.applyInteraction(data, midFlat, P, ctx);
    // The rewarding pattern leaned on connection (0.9 > 0.5) → pulled up.
    expect(next.weights.connection).toBeGreaterThan(before);
  });

  it("never lets a weight fall below the hard floor or above the ceiling", () => {
    let data = rewardBlock.init(P);
    for (let i = 0; i < 200; i++) {
      data = rewardBlock.applyInteraction(data, burnedSignal, P, {
        now: T0 + i,
        elapsedMs: 0,
        weight: 1,
      });
    }
    for (const w of Object.values(data.weights)) {
      expect(w).toBeGreaterThanOrEqual(P.reward.weightFloor);
      expect(w).toBeLessThanOrEqual(P.reward.weightCeil);
    }
  });

  it("ignores non-message folds (percept check-ins never punish)", () => {
    const data = rewardBlock.init(P);
    const checkin = { ...flatSignal, kind: "checkin" as const };
    const next = rewardBlock.applyInteraction(data, checkin, P, ctx);
    expect(next).toBe(data);
  });
});

describe("aversion loop", () => {
  const ctx = { now: T0, elapsedMs: 0, weight: 1 };

  it("stores a trigger after real effort meets a near-dead outcome", () => {
    const data = rewardBlock.init(P);
    expect(computeStimulus(burnedSignal, P)).toBeLessThanOrEqual(P.reward.aversionThreshold);
    const next = rewardBlock.applyInteraction(data, burnedSignal, P, ctx);
    expect(next.aversive.length).toBe(1);
    expect(next.aversive[0].inputs.connection).toBeCloseTo(0.9, 5);
  });

  it("dampens early on a similar pattern, even above the aversion threshold", () => {
    let data = rewardBlock.init(P);
    data = rewardBlock.applyInteraction(data, burnedSignal, P, ctx);
    // Similar shape but an okay outcome (middle band — no regime fires).
    const similarOkay = signal({
      connection: 0.85,
      curiosity: 0.15,
      novelty: 0.15,
      expression: 0.15,
      moodFactor: 1.6,
    });
    const stim = computeStimulus(similarOkay, P);
    expect(stim).toBeGreaterThan(P.reward.exploreBelow);
    const before = data.weights.connection;
    const next = rewardBlock.applyInteraction(data, similarOkay, P, ctx);
    expect(next.weights.connection).toBeLessThan(before);
  });

  it("does not dampen on a dissimilar pattern", () => {
    let data = rewardBlock.init(P);
    data = rewardBlock.applyInteraction(data, burnedSignal, P, ctx);
    const dissimilar = signal({
      connection: 0.1,
      curiosity: 0.9,
      novelty: 0.9,
      expression: 0.6,
      moodFactor: 1.2,
    });
    const before = { ...data.weights };
    const next = rewardBlock.applyInteraction(data, dissimilar, P, ctx);
    // connection (the stored trigger's dominant tendency) is untouched.
    expect(next.weights.connection).toBeGreaterThanOrEqual(before.connection);
  });

  it("aversions decay over time and drop out below the threshold", () => {
    let data = rewardBlock.init(P);
    data = rewardBlock.applyInteraction(data, burnedSignal, P, ctx);
    const strength = data.aversive[0].strength;
    const hoursToDrop =
      (strength - P.reward.patternDropBelow) / P.reward.aversiveDecayPerHour + 1;
    const decayed = rewardBlock.decay(data, P, {
      now: T0 + hoursToDrop * HOUR,
      elapsedMs: hoursToDrop * HOUR,
      weight: 1,
    });
    expect(decayed.aversive.length).toBe(0);
  });
});

describe("decay and neutrality", () => {
  it("weights heal toward neutral 1 over time and the level drifts home", () => {
    const data: RewardData = {
      ...rewardBlock.init(P),
      level: 90,
      weights: { connection: 0.6, curiosity: 1.4, novelty: 1, expression: 1 },
    };
    const next = rewardBlock.decay(data, P, { now: T0 + 4 * HOUR, elapsedMs: 4 * HOUR, weight: 1 });
    expect(next.weights.connection).toBeGreaterThan(0.6);
    expect(next.weights.curiosity).toBeLessThan(1.4);
    expect(next.weights.novelty).toBe(1);
    expect(next.level).toBeLessThan(90);
    expect(next.level).toBeGreaterThanOrEqual(P.reward.baseline);
  });

  it("a neutral state contributes nothing to the persona and gains of exactly 1", () => {
    const data = rewardBlock.init(P);
    expect(rewardBlock.contributePersona(data, P, T0)).toBe("");
    const gains = rewardDriveGains(data, P);
    for (const g of Object.values(gains)) expect(g).toBe(1);
  });

  it("pacing surfaces only at clearly high or low reward levels", () => {
    const base = rewardBlock.init(P);
    expect(
      rewardBlock.contributePersona({ ...base, level: P.reward.paceHighAbove + 1 }, P, T0),
    ).not.toBe("");
    expect(
      rewardBlock.contributePersona({ ...base, level: P.reward.paceLowBelow - 1 }, P, T0),
    ).not.toBe("");
    expect(rewardBlock.contributePersona({ ...base, level: 50 }, P, T0)).toBe("");
  });

  it("summarize surfaces nothing (no dedicated UI numbers)", () => {
    expect(rewardBlock.summarize(rewardBlock.init(P), P, T0)).toEqual({});
  });
});

describe("integration with the runtime", () => {
  it("evolve applies learned gains: a braked connection weight slows connection feeding", () => {
    const neutral = createSelf(P, undefined, T0);
    const braked: InnerSelf = {
      ...neutral,
      blocks: {
        ...neutral.blocks,
        [REWARD_BLOCK_ID]: {
          ...neutral.blocks[REWARD_BLOCK_ID]!,
          data: {
            ...rewardData(neutral),
            weights: { connection: 0.5, curiosity: 1, novelty: 1, expression: 1 },
          },
        },
      },
    };
    const feed = signal({ connection: 1, curiosity: 0, novelty: 0, expression: 0 });
    const a = evolve(neutral, feed, P, T0);
    const b = evolve(braked, feed, P, T0);
    const level = (self: InnerSelf) =>
      (self.blocks.drives!.data as { levels: Record<string, number> }).levels.connection;
    expect(level(b)).toBeLessThan(level(a));
  });

  it("neutral reward state leaves drive evolution identical (invariant)", () => {
    const self = createSelf(P, undefined, T0);
    const withoutReward: typeof P = {
      ...P,
      enabledBlocks: P.enabledBlocks.filter((id) => id !== REWARD_BLOCK_ID),
    };
    const s = signal({ connection: 0.7, curiosity: 0.4, novelty: 0.6, expression: 0.3 });
    const a = evolve(self, s, P, T0);
    const b = evolve(self, s, withoutReward, P.learningRate ? T0 : T0);
    const levels = (x: InnerSelf) => x.blocks.drives!.data as { levels: Record<string, number> };
    expect(levels(a).levels).toEqual(levels(b).levels);
  });

  it("hydrate initializes the reward block on old selves missing it", () => {
    const self = createSelf(P, undefined, T0);
    const { [REWARD_BLOCK_ID]: _drop, ...rest } = self.blocks;
    const old = { ...self, blocks: rest };
    const hydrated = hydrate(JSON.stringify(old), P, T0);
    expect(hydrated.blocks[REWARD_BLOCK_ID]).toBeDefined();
    const data = rewardData(hydrated);
    expect(data.level).toBe(P.reward.baseline);
    expect(rewardDriveGains(data, P).connection).toBe(1);
  });

  it("project decays the reward block without breaking bounds", () => {
    let self = createSelf(P, undefined, T0);
    self = evolve(self, richSignal, P, T0);
    const later = project(self, P, T0 + 48 * HOUR);
    const data = rewardData(later);
    expect(data.level).toBeGreaterThanOrEqual(P.bounds.min);
    expect(data.level).toBeLessThanOrEqual(P.bounds.max);
    for (const w of Object.values(data.weights)) {
      expect(w).toBeGreaterThanOrEqual(P.reward.weightFloor);
      expect(w).toBeLessThanOrEqual(P.reward.weightCeil);
    }
  });
});
