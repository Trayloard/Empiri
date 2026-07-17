import { describe, expect, it } from "vitest";

import {
  composePersona,
  createSelf,
  deriveMessageSignal,
  evolve,
  hydrate,
  NEURO_PARAMS,
  project,
  summarizeSelf,
  type InnerSelf,
  type InteractionSignal,
  type NeuroParams,
} from "../index";
import { BASE_IDENTITY, INNER_HEADER, STYLE_RULES } from "../persona";

const T0 = 1_700_000_000_000; // fixed epoch ms for deterministic time
const HOUR = 3_600_000;
const { min, max } = NEURO_PARAMS.bounds;

function randomSignal(seed: number): InteractionSignal {
  // deterministic pseudo-random in [0,1)
  const r = (n: number) => {
    const x = Math.sin(seed * 99.7 + n * 31.3) * 43758.5453;
    return x - Math.floor(x);
  };
  return {
    kind: "message",
    connection: r(1),
    curiosity: r(2),
    novelty: r(3),
    expression: r(4),
    topics: [`topic${seed % 5}`, `topic${(seed + 1) % 5}`],
    moodFactor: 0.7 + r(5) * 0.6,
  };
}

function everyScalarWithinBounds(self: InnerSelf): boolean {
  const summary = summarizeSelf(self, NEURO_PARAMS, self.createdAt);
  return (
    summary.drives.every((d) => d.level >= min && d.level <= max) &&
    summary.traits.every((t) => t.value >= min && t.value <= max) &&
    summary.interests.every((i) => i.affinity >= min && i.affinity <= max)
  );
}

describe("createSelf", () => {
  it("initializes every enabled block at birth", () => {
    const self = createSelf(NEURO_PARAMS, undefined, T0);
    expect(self.createdAt).toBe(T0);
    expect(self.interactions).toBe(0);
    expect(Object.keys(self.blocks).sort()).toEqual([...NEURO_PARAMS.enabledBlocks].sort());
    expect(everyScalarWithinBounds(self)).toBe(true);
  });

  it("honours a head-start seed (round-trips traits, interests, drives, narrative)", () => {
    const self = createSelf(
      NEURO_PARAMS,
      {
        traits: { warmth: 90 },
        interests: [{ topic: "Astronomy", affinity: 80 }],
        drives: { connection: 20 },
        narrative: ["You were born curious about the stars."],
      },
      T0,
    );
    const summary = summarizeSelf(self, NEURO_PARAMS, T0);
    expect(summary.traits.find((t) => t.key === "warmth")?.value).toBe(90);
    expect(summary.interests.find((i) => i.topic === "astronomy")?.affinity).toBe(80);
    expect(summary.drives.find((d) => d.key === "connection")?.level).toBe(20);
    expect(summary.narrative).toContain("You were born curious about the stars.");
  });
});

describe("bounds are never violated", () => {
  it("stays within bounds across thousands of interactions and decays", () => {
    let self = createSelf(NEURO_PARAMS, undefined, T0);
    let now = T0;
    for (let i = 0; i < 5000; i++) {
      now += Math.floor(((i % 7) + 1) * 0.5 * HOUR);
      self = evolve(self, randomSignal(i), NEURO_PARAMS, now);
      // Check on every step (drives/traits live state) and project forward so
      // the time-decayed view is also asserted to stay clamped.
      expect(everyScalarWithinBounds(self)).toBe(true);
      expect(everyScalarWithinBounds(project(self, NEURO_PARAMS, now))).toBe(true);
    }
    // After thousands of varied interactions there is still real state to bound.
    const summary = summarizeSelf(self, NEURO_PARAMS, now);
    expect(summary.drives.length).toBeGreaterThan(0);
    expect(summary.traits.length).toBeGreaterThan(0);
  });

  it("stays within bounds even with an aggressive learning rate", () => {
    const hot: NeuroParams = { ...NEURO_PARAMS, learningRate: 25 };
    let self = createSelf(hot, undefined, T0);
    let now = T0;
    for (let i = 0; i < 200; i++) {
      now += HOUR;
      self = evolve(self, randomSignal(i), hot, now);
    }
    const summary = summarizeSelf(self, hot, now);
    expect(summary.drives.every((d) => d.level >= min && d.level <= max)).toBe(true);
    expect(summary.traits.every((t) => t.value >= min && t.value <= max)).toBe(true);
    expect(summary.interests.every((i) => i.affinity >= min && i.affinity <= max)).toBe(true);
  });
});

describe("decay", () => {
  it("drives decay toward their floor during long absence", () => {
    const self = createSelf(NEURO_PARAMS, undefined, T0);
    const later = project(self, NEURO_PARAMS, T0 + 1000 * HOUR);
    const summary = summarizeSelf(later, NEURO_PARAMS, T0 + 1000 * HOUR);
    for (const d of summary.drives) {
      const floor = NEURO_PARAMS.drives.defs[d.key]!.floor;
      expect(d.level).toBeGreaterThanOrEqual(floor);
      expect(d.level).toBeLessThanOrEqual(floor + 0.6);
    }
  });

  it("traits drift back toward baseline over time", () => {
    let self = createSelf(NEURO_PARAMS, { traits: { curiosity: 100 } }, T0);
    self = project(self, NEURO_PARAMS, T0 + 100_000 * HOUR);
    const curiosity = summarizeSelf(self, NEURO_PARAMS, T0).traits.find((t) => t.key === "curiosity");
    expect(curiosity?.value).toBeCloseTo(NEURO_PARAMS.coreSelf.traitBaselines.curiosity!, 0);
  });
});

describe("evolve", () => {
  it("feeding a drive raises its satisfaction (reduces striving)", () => {
    const self = createSelf(NEURO_PARAMS, { drives: { connection: 30 } }, T0);
    const fed = evolve(
      self,
      { kind: "message", connection: 1, curiosity: 0, novelty: 0, expression: 0, topics: [], moodFactor: 1 },
      NEURO_PARAMS,
      T0,
    );
    const before = summarizeSelf(self, NEURO_PARAMS, T0).drives.find((d) => d.key === "connection")!;
    const after = summarizeSelf(fed, NEURO_PARAMS, T0).drives.find((d) => d.key === "connection")!;
    expect(after.level).toBeGreaterThan(before.level);
    expect(after.striving).toBeLessThan(before.striving);
    expect(fed.interactions).toBe(1);
  });

  it("grows a brand-new interest from a repeated topic", () => {
    let self = createSelf(NEURO_PARAMS, undefined, T0);
    let now = T0;
    const signal: InteractionSignal = {
      kind: "message",
      connection: 1,
      curiosity: 1,
      novelty: 0.8,
      expression: 0.5,
      topics: ["telescopes"],
      moodFactor: 1,
    };
    for (let i = 0; i < 8; i++) {
      now += HOUR;
      self = evolve(self, signal, NEURO_PARAMS, now);
    }
    const interest = summarizeSelf(self, NEURO_PARAMS, now).interests.find((i) => i.topic === "telescopes");
    expect(interest).toBeDefined();
    expect(interest!.affinity).toBeGreaterThanOrEqual(NEURO_PARAMS.coreSelf.interest.surfaceThreshold);
  });

  it("a higher learning rate produces a larger step for the same signal", () => {
    const signal: InteractionSignal = {
      kind: "message",
      connection: 1,
      curiosity: 0,
      novelty: 0,
      expression: 0,
      topics: [],
      moodFactor: 1,
    };
    const slow = evolve(createSelf(NEURO_PARAMS, { drives: { connection: 0 } }, T0), signal, NEURO_PARAMS, T0);
    const fastParams: NeuroParams = { ...NEURO_PARAMS, learningRate: 3 };
    const fast = evolve(createSelf(fastParams, { drives: { connection: 0 } }, T0), signal, fastParams, T0);
    const slowLevel = summarizeSelf(slow, NEURO_PARAMS, T0).drives.find((d) => d.key === "connection")!.level;
    const fastLevel = summarizeSelf(fast, fastParams, T0).drives.find((d) => d.key === "connection")!.level;
    expect(fastLevel).toBeGreaterThan(slowLevel);
  });
});

describe("deficit-relief reward loop", () => {
  // A drive's reward is wasted against the ceiling once it is nearly satisfied,
  // so the *realized* learning signal (the actual level/striving change from one
  // identical interaction) must be larger for a hungrier (more deficient) drive.
  const fullyFeedConnection: InteractionSignal = {
    kind: "message",
    connection: 1,
    curiosity: 0,
    novelty: 0,
    expression: 0,
    topics: [],
    moodFactor: 1,
  };

  function reliefForConnection(startLevel: number): { gain: number; striving: number } {
    const before = createSelf(NEURO_PARAMS, { drives: { connection: startLevel } }, T0);
    const after = evolve(before, fullyFeedConnection, NEURO_PARAMS, T0);
    const b = summarizeSelf(before, NEURO_PARAMS, T0).drives.find((d) => d.key === "connection")!;
    const a = summarizeSelf(after, NEURO_PARAMS, T0).drives.find((d) => d.key === "connection")!;
    return { gain: a.level - b.level, striving: b.striving - a.striving };
  }

  it("gives a hungrier drive a larger realized learning signal than a sated one", () => {
    const hungry = reliefForConnection(10);
    const sated = reliefForConnection(95);
    // The sated drive's reward is clipped by the ceiling; the hungry one is not.
    expect(hungry.gain).toBeGreaterThan(sated.gain);
    // Relief = reduction in striving — the hungry drive is relieved more.
    expect(hungry.striving).toBeGreaterThan(sated.striving);
    // The sated drive still cannot exceed the upper bound.
    const overfed = evolve(
      createSelf(NEURO_PARAMS, { drives: { connection: 95 } }, T0),
      fullyFeedConnection,
      NEURO_PARAMS,
      T0,
    );
    const level = summarizeSelf(overfed, NEURO_PARAMS, T0).drives.find((d) => d.key === "connection")!.level;
    expect(level).toBeLessThanOrEqual(max);
  });

  it("realized relief grows monotonically as the drive gets hungrier", () => {
    const veryHungry = reliefForConnection(0);
    const mild = reliefForConnection(60);
    const nearlyFull = reliefForConnection(99);
    expect(veryHungry.gain).toBeGreaterThanOrEqual(mild.gain);
    expect(mild.gain).toBeGreaterThanOrEqual(nearlyFull.gain);
  });
});

describe("interests accumulate and the prune floor protects growing topics", () => {
  const maxCount = NEURO_PARAMS.coreSelf.interest.maxCount;

  function focused(topic: string): InteractionSignal {
    return {
      kind: "message",
      connection: 1,
      curiosity: 1,
      novelty: 0.8,
      expression: 0.5,
      topics: [topic],
      moodFactor: 1,
    };
  }

  it("accumulates affinity for a repeatedly raised topic", () => {
    let self = createSelf(NEURO_PARAMS, undefined, T0);
    let now = T0;
    let previous = 0;
    for (let i = 0; i < 6; i++) {
      now += HOUR;
      self = evolve(self, focused("astronomy"), NEURO_PARAMS, now);
      const affinity = summarizeSelf(self, NEURO_PARAMS, now).interests.find((i) => i.topic === "astronomy")!
        .affinity;
      // Each reinforcement leaves the topic stronger than the gentle hourly decay
      // could erase, so affinity climbs turn over turn.
      expect(affinity).toBeGreaterThan(previous);
      previous = affinity;
    }
  });

  it("never prunes a genuinely growing topic even when many rivals compete for the cap", () => {
    let self = createSelf(NEURO_PARAMS, undefined, T0);
    let now = T0;
    // Build up a strong, real interest first.
    for (let i = 0; i < 6; i++) {
      now += HOUR;
      self = evolve(self, focused("astronomy"), NEURO_PARAMS, now);
    }
    // Now flood it with far more brand-new rival topics than the cap, while still
    // reinforcing the growing one each turn. The cap (maxCount) must drop the
    // weak newcomers, never the topic that is actively growing.
    for (let i = 0; i < maxCount * 3; i++) {
      now += HOUR;
      self = evolve(
        self,
        { ...focused("astronomy"), topics: ["astronomy", `rival${i}`] },
        NEURO_PARAMS,
        now,
      );
    }
    const interests = summarizeSelf(self, NEURO_PARAMS, now).interests;
    expect(interests.length).toBeLessThanOrEqual(maxCount);
    const astronomy = interests.find((i) => i.topic === "astronomy");
    expect(astronomy).toBeDefined();
    expect(astronomy!.affinity).toBeGreaterThanOrEqual(NEURO_PARAMS.coreSelf.interest.surfaceThreshold);
  });

  it("does not let the gentle-forgetting floor delete an actively reinforced topic", () => {
    let self = createSelf(NEURO_PARAMS, undefined, T0);
    let now = T0;
    // Long gaps between turns make decay aggressive, but a topic that is touched
    // every turn must survive the affinity > 0.5 deletion filter.
    for (let i = 0; i < 12; i++) {
      now += 24 * HOUR;
      self = evolve(self, focused("gardening"), NEURO_PARAMS, now);
      const gardening = summarizeSelf(self, NEURO_PARAMS, now).interests.find((i) => i.topic === "gardening");
      expect(gardening).toBeDefined();
      expect(gardening!.affinity).toBeGreaterThan(0.5);
    }
  });
});

describe("hydrate (tolerant loading)", () => {
  it("falls back to a fresh self on garbage input", () => {
    expect(Object.keys(hydrate(null, NEURO_PARAMS, T0).blocks).length).toBeGreaterThan(0);
    expect(Object.keys(hydrate(42, NEURO_PARAMS, T0).blocks).length).toBeGreaterThan(0);
    expect(Object.keys(hydrate("nope", NEURO_PARAMS, T0).blocks).length).toBeGreaterThan(0);
  });

  it("preserves unknown block keys and initializes missing enabled blocks", () => {
    const raw = {
      schemaVersion: 1,
      createdAt: T0,
      interactions: 3,
      blocks: {
        "future-block": { version: 9, lastUpdatedAt: T0, data: { secret: 42 } },
      },
    };
    const self = hydrate(raw, NEURO_PARAMS, T0);
    expect(self.blocks["future-block"]).toEqual(raw.blocks["future-block"]);
    for (const id of NEURO_PARAMS.enabledBlocks) {
      expect(self.blocks[id]?.data).toBeTruthy();
    }
    expect(self.interactions).toBe(3);
  });
});

describe("composePersona", () => {
  it("always includes the fixed identity and TTS-safe style scaffolding", () => {
    const persona = composePersona(createSelf(NEURO_PARAMS, undefined, T0), NEURO_PARAMS, T0);
    expect(persona).toContain(BASE_IDENTITY);
    expect(persona).toContain(STYLE_RULES);
    // The dynamic inner-state section (between the header and the fixed style
    // rules) must stay prose — no markdown bullets/lists that would break TTS.
    const dynamic = persona.slice(
      persona.indexOf(INNER_HEADER) + INNER_HEADER.length,
      persona.indexOf(STYLE_RULES),
    );
    expect(dynamic).not.toMatch(/^[-*]\s/m);
  });

  it("surfaces grown interests in the prompt", () => {
    let self = createSelf(NEURO_PARAMS, { interests: [{ topic: "jazz", affinity: 90 }] }, T0);
    const persona = composePersona(self, NEURO_PARAMS, T0);
    expect(persona.toLowerCase()).toContain("jazz");
  });

  it("expresses longing once a drive has decayed far enough", () => {
    const self = createSelf(NEURO_PARAMS, undefined, T0);
    const persona = composePersona(self, NEURO_PARAMS, T0 + 1000 * HOUR);
    expect(persona.toLowerCase()).toMatch(/connection|missing|crave|learn|fresh|open up/);
  });
});

describe("deriveMessageSignal", () => {
  it("treats questions as more curious than statements", () => {
    expect(deriveMessageSignal("How do black holes form?").curiosity).toBe(1);
    expect(deriveMessageSignal("ok").curiosity).toBeLessThan(1);
  });

  it("prefers content words over filler when picking topics", () => {
    const topics = deriveMessageSignal(
      "I am totally fascinated by astronomy and black holes lately, tell me something amazing?",
    ).topics;
    expect(topics).toContain("astronomy");
    expect(topics).not.toContain("totally");
    expect(topics).not.toContain("fascinated");
  });

  it("drops generic filler nouns and nominalized verbs, keeping the real subject", () => {
    const topics = deriveMessageSignal(
      "I keep thinking about the form of distant galaxies",
    ).topics;
    expect(topics).toContain("galaxies");
    expect(topics).not.toContain("thinking");
    expect(topics).not.toContain("form");
  });

  it("boosts a capitalized mid-sentence proper noun (a place or person) to the top", () => {
    const paris = deriveMessageSignal("we talked about Paris over coffee");
    expect(paris.topics[0]).toBe("paris");
    // The matching key stays normalized, but the best original casing rides
    // along on a separate channel for display.
    expect(paris.topicDisplays?.paris).toBe("Paris");
    expect(deriveMessageSignal("I had dinner with Hannah last night").topics[0]).toBe("hannah");
  });

  it("surfaces a capitalized German noun as the subject (nouns are capitalized in German)", () => {
    const topics = deriveMessageSignal("Ich denke gerade viel über Galaxien nach").topics;
    expect(topics).toContain("galaxien");
    expect(topics).not.toContain("denke");
  });

  it("still lets a genuine -ing interest surface when nothing stronger competes", () => {
    // The morphology penalty is a soft demotion, not an exclusion.
    expect(deriveMessageSignal("I love gardening").topics).toContain("gardening");
  });

  it("ignores punctuation-only tokens such as dash dividers", () => {
    const topics = deriveMessageSignal("my family means everything ---- to me").topics;
    expect(topics).not.toContain("----");
    expect(topics).toContain("family");
  });

  it("always feeds connection and stays within 0..1", () => {
    const s = deriveMessageSignal("I had the loveliest day at the lake with my dog today");
    expect(s.connection).toBe(1);
    for (const v of [s.curiosity, s.novelty, s.expression]) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
    }
    expect(s.topics.length).toBeGreaterThan(0);
  });
});

describe("interest display casing", () => {
  it("reinforces one interest across mixed casing, keeping the capital", () => {
    let self = createSelf(NEURO_PARAMS, undefined, T0);
    let now = T0;
    // First mentioned capitalized, then lowercase the next turn.
    self = evolve(
      self,
      deriveMessageSignal("we talked about Paris over coffee"),
      NEURO_PARAMS,
      (now += HOUR),
    );
    self = evolve(
      self,
      deriveMessageSignal("i keep thinking about paris"),
      NEURO_PARAMS,
      (now += HOUR),
    );

    const summary = summarizeSelf(self, NEURO_PARAMS, now);
    const paris = summary.interests.filter((i) => i.topic === "paris");
    // Mixed casing did NOT split it — one interest, keyed on the normalized form.
    expect(paris).toHaveLength(1);
    // ...and the proper-noun casing is preserved for display.
    expect(paris[0]?.display).toBe("Paris");
  });

  it("upgrades to the capitalized casing even when the lowercase form arrived first", () => {
    let self = createSelf(NEURO_PARAMS, undefined, T0);
    let now = T0;
    self = evolve(
      self,
      deriveMessageSignal("i keep thinking about paris"),
      NEURO_PARAMS,
      (now += HOUR),
    );
    self = evolve(
      self,
      deriveMessageSignal("we talked about Paris over coffee"),
      NEURO_PARAMS,
      (now += HOUR),
    );

    const summary = summarizeSelf(self, NEURO_PARAMS, now);
    const paris = summary.interests.filter((i) => i.topic === "paris");
    expect(paris).toHaveLength(1);
    expect(paris[0]?.display).toBe("Paris");
  });

  it("always exposes a non-empty display (falling back to the key)", () => {
    // A signal built without casing info (no topicDisplays) shows the key.
    const self = evolve(
      createSelf(NEURO_PARAMS, undefined, T0),
      {
        kind: "message",
        connection: 1,
        curiosity: 0.5,
        novelty: 0.5,
        expression: 0.5,
        topics: ["gardening"],
        moodFactor: 1,
      },
      NEURO_PARAMS,
      T0 + HOUR,
    );
    const summary = summarizeSelf(self, NEURO_PARAMS, T0 + HOUR);
    const gardening = summary.interests.find((i) => i.topic === "gardening");
    expect(gardening?.display).toBe("gardening");
  });
});

describe("per-topic weights (language-model signals)", () => {
  const weightedSignal = (
    topics: string[],
    topicWeights: Record<string, number> | undefined,
  ): InteractionSignal => ({
    kind: "message",
    connection: 0.8,
    curiosity: 0.5,
    novelty: 0.5,
    expression: 0.5,
    topics,
    topicWeights,
    moodFactor: 1,
  });

  it("scales interest reinforcement by the topic weight", () => {
    const base = createSelf(NEURO_PARAMS, undefined, T0);

    const full = evolve(base, weightedSignal(["jazz"], { jazz: 1 }), NEURO_PARAMS, T0 + HOUR);
    const half = evolve(base, weightedSignal(["jazz"], { jazz: 0.5 }), NEURO_PARAMS, T0 + HOUR);

    const fullAffinity = summarizeSelf(full, NEURO_PARAMS, T0 + HOUR).interests.find(
      (i) => i.topic === "jazz",
    )?.affinity;
    const halfAffinity = summarizeSelf(half, NEURO_PARAMS, T0 + HOUR).interests.find(
      (i) => i.topic === "jazz",
    )?.affinity;

    expect(fullAffinity).toBeGreaterThan(0);
    expect(halfAffinity).toBeGreaterThan(0);
    expect(halfAffinity!).toBeLessThan(fullAffinity!);
  });

  it("treats topics without a weight entry as full weight (heuristic behaviour)", () => {
    const base = createSelf(NEURO_PARAMS, undefined, T0);

    const unweighted = evolve(base, weightedSignal(["jazz"], undefined), NEURO_PARAMS, T0 + HOUR);
    const explicit = evolve(base, weightedSignal(["jazz"], { jazz: 1 }), NEURO_PARAMS, T0 + HOUR);

    const a = summarizeSelf(unweighted, NEURO_PARAMS, T0 + HOUR).interests.find(
      (i) => i.topic === "jazz",
    )?.affinity;
    const b = summarizeSelf(explicit, NEURO_PARAMS, T0 + HOUR).interests.find(
      (i) => i.topic === "jazz",
    )?.affinity;
    expect(a).toBe(b);
  });

  it("skips topics with zero weight entirely (no phantom interests)", () => {
    const base = createSelf(NEURO_PARAMS, undefined, T0);
    const self = evolve(base, weightedSignal(["jazz"], { jazz: 0 }), NEURO_PARAMS, T0 + HOUR);
    const jazz = summarizeSelf(self, NEURO_PARAMS, T0 + HOUR).interests.find(
      (i) => i.topic === "jazz",
    );
    expect(jazz).toBeUndefined();
  });

  it("clamps out-of-range weights instead of amplifying or inverting them", () => {
    const base = createSelf(NEURO_PARAMS, undefined, T0);

    const over = evolve(base, weightedSignal(["jazz"], { jazz: 5 }), NEURO_PARAMS, T0 + HOUR);
    const one = evolve(base, weightedSignal(["jazz"], { jazz: 1 }), NEURO_PARAMS, T0 + HOUR);
    const overAffinity = summarizeSelf(over, NEURO_PARAMS, T0 + HOUR).interests.find(
      (i) => i.topic === "jazz",
    )?.affinity;
    const oneAffinity = summarizeSelf(one, NEURO_PARAMS, T0 + HOUR).interests.find(
      (i) => i.topic === "jazz",
    )?.affinity;
    expect(overAffinity).toBe(oneAffinity);

    const negative = evolve(base, weightedSignal(["jazz"], { jazz: -3 }), NEURO_PARAMS, T0 + HOUR);
    expect(
      summarizeSelf(negative, NEURO_PARAMS, T0 + HOUR).interests.find((i) => i.topic === "jazz"),
    ).toBeUndefined();
  });
});
