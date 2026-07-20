import { describe, expect, it } from "vitest";

import {
  composePersona,
  createSelf,
  evolve,
  hydrate,
  MEMORY_BLOCK_ID,
  memoryBlock,
  NEURO_PARAMS,
  normalizeFactKey,
  summarizeSelf,
  type InnerSelf,
  type InteractionSignal,
  type MemoryData,
} from "../index";

const T0 = 1_700_000_000_000; // fixed epoch ms for deterministic time
const HOUR = 3_600_000;
const MEM = NEURO_PARAMS.memory;

function signalWithFacts(
  facts: Array<{ key: string; text: string; confidence: number }>,
): InteractionSignal {
  return {
    kind: "message",
    connection: 0.5,
    curiosity: 0.3,
    novelty: 0.3,
    expression: 0.3,
    topics: [],
    moodFactor: 1,
    facts,
  };
}

function memoryData(self: InnerSelf): MemoryData {
  return self.blocks[MEMORY_BLOCK_ID]!.data as MemoryData;
}

describe("normalizeFactKey", () => {
  it("normalizes casing, spaces, hyphens, and punctuation into snake_case", () => {
    expect(normalizeFactKey("Dog Name")).toBe("dog_name");
    expect(normalizeFactKey("dog-name")).toBe("dog_name");
    expect(normalizeFactKey("  dog__name!  ")).toBe("dog_name");
    expect(normalizeFactKey("EXAM_DATE")).toBe("exam_date");
  });

  it("caps the key length", () => {
    expect(normalizeFactKey("x".repeat(80)).length).toBeLessThanOrEqual(40);
  });
});

describe("memory block: learning facts", () => {
  it("seeds a new fact with confidence-scaled salience", () => {
    const self = createSelf(NEURO_PARAMS, undefined, T0);
    const evolved = evolve(
      self,
      signalWithFacts([{ key: "dog_name", text: "Their dog is called Milo", confidence: 0.8 }]),
      NEURO_PARAMS,
      T0,
    );
    const facts = memoryData(evolved).facts;
    expect(facts).toHaveLength(1);
    expect(facts[0].key).toBe("dog_name");
    expect(facts[0].text).toBe("Their dog is called Milo");
    expect(facts[0].salience).toBeCloseTo(
      MEM.seedSalienceBase + MEM.seedSaliencePerConfidence * 0.8,
      5,
    );
    expect(facts[0].lastConfirmedAt).toBe(T0);
  });

  it("leaves state untouched for signals without facts (e.g. check-ins)", () => {
    const self = createSelf(NEURO_PARAMS, undefined, T0);
    const withFact = evolve(
      self,
      signalWithFacts([{ key: "job", text: "They work as a nurse", confidence: 0.9 }]),
      NEURO_PARAMS,
      T0,
    );
    const before = memoryData(withFact);
    const after = evolve(
      withFact,
      { ...signalWithFacts([]), facts: undefined },
      NEURO_PARAMS,
      T0,
    );
    expect(memoryData(after).facts.map((f) => f.text)).toEqual(
      before.facts.map((f) => f.text),
    );
  });

  it("refreshes salience and lastConfirmedAt when the same fact is re-mentioned", () => {
    const self = createSelf(NEURO_PARAMS, undefined, T0);
    const first = evolve(
      self,
      signalWithFacts([{ key: "dog_name", text: "Their dog is called Milo", confidence: 0.8 }]),
      NEURO_PARAMS,
      T0,
    );
    const s1 = memoryData(first).facts[0].salience;
    const later = T0 + 2 * HOUR;
    const second = evolve(
      first,
      signalWithFacts([{ key: "dog_name", text: "Their dog is called Milo", confidence: 0.8 }]),
      NEURO_PARAMS,
      later,
    );
    const fact = memoryData(second).facts[0];
    expect(fact.salience).toBeGreaterThan(s1 - 2 * MEM.decayPerHour); // decay applied, then boosted past it
    expect(fact.salience).toBeGreaterThan(s1);
    expect(fact.lastConfirmedAt).toBe(later);
    expect(memoryData(second).facts).toHaveLength(1);
  });

  it("replaces the text when the same slot arrives with a contradiction", () => {
    const self = createSelf(NEURO_PARAMS, undefined, T0);
    const first = evolve(
      self,
      signalWithFacts([{ key: "job", text: "They work as a teacher", confidence: 0.9 }]),
      NEURO_PARAMS,
      T0,
    );
    const second = evolve(
      first,
      signalWithFacts([{ key: "job", text: "They just started a new job as a designer", confidence: 0.9 }]),
      NEURO_PARAMS,
      T0 + HOUR,
    );
    const facts = memoryData(second).facts;
    expect(facts).toHaveLength(1);
    expect(facts[0].text).toBe("They just started a new job as a designer");
  });

  it("a replacement never lands below fresh-seed salience, even after long decay", () => {
    const self = createSelf(NEURO_PARAMS, undefined, T0);
    const first = evolve(
      self,
      signalWithFacts([{ key: "home_city", text: "They live in Hamburg", confidence: 0.6 }]),
      NEURO_PARAMS,
      T0,
    );
    // Decay for two weeks, then the fact is restated.
    const later = T0 + 14 * 24 * HOUR;
    const second = evolve(
      first,
      signalWithFacts([{ key: "home_city", text: "They moved to Berlin", confidence: 0.6 }]),
      NEURO_PARAMS,
      later,
    );
    const fact = memoryData(second).facts[0];
    expect(fact.text).toBe("They moved to Berlin");
    expect(fact.salience).toBeGreaterThanOrEqual(
      MEM.seedSalienceBase + MEM.seedSaliencePerConfidence * 0.6,
    );
  });

  it("evicts the lowest-salience facts beyond maxCount", () => {
    let self = createSelf(NEURO_PARAMS, undefined, T0);
    for (let i = 0; i < MEM.maxCount + 3; i++) {
      self = evolve(
        self,
        signalWithFacts([
          { key: `fact_${i}`, text: `Fact number ${i}`, confidence: 0.3 + (i % 7) * 0.1 },
        ]),
        NEURO_PARAMS,
        T0 + i, // same moment, negligible decay
      );
    }
    const facts = memoryData(self).facts;
    expect(facts.length).toBeLessThanOrEqual(MEM.maxCount);
  });

  it("skips malformed candidates without touching valid ones", () => {
    const self = createSelf(NEURO_PARAMS, undefined, T0);
    const evolved = evolve(
      self,
      signalWithFacts([
        { key: "x", text: "Too-short key", confidence: 0.9 },
        { key: "ok_fact", text: "   ", confidence: 0.9 },
        { key: "zero_conf", text: "Zero confidence", confidence: 0 },
        { key: "dog_name", text: "Their dog is called Milo", confidence: 0.9 },
      ]),
      NEURO_PARAMS,
      T0,
    );
    expect(memoryData(evolved).facts.map((f) => f.key)).toEqual(["dog_name"]);
  });
});

describe("memory block: decay", () => {
  it("fades salience over time and forgets facts that fall below the floor", () => {
    const self = createSelf(NEURO_PARAMS, undefined, T0);
    const withFact = evolve(
      self,
      signalWithFacts([{ key: "dog_name", text: "Their dog is called Milo", confidence: 0.8 }]),
      NEURO_PARAMS,
      T0,
    );
    const seeded = memoryData(withFact).facts[0].salience;

    // After a day: still there, lower.
    const dayLater = summarizeSelf(withFact, NEURO_PARAMS, T0 + 24 * HOUR);
    expect(dayLater.facts).toHaveLength(1);
    expect(dayLater.facts[0].salience).toBeLessThan(seeded);

    // After long enough for salience to hit the drop floor: forgotten.
    const hoursToGone = (seeded - MEM.dropBelow) / MEM.decayPerHour + 1;
    const gone = summarizeSelf(withFact, NEURO_PARAMS, T0 + hoursToGone * HOUR);
    expect(gone.facts).toHaveLength(0);
  });

  it("an unrefreshed fact stays usable for at least a few days", () => {
    const self = createSelf(NEURO_PARAMS, undefined, T0);
    const withFact = evolve(
      self,
      signalWithFacts([{ key: "exam_date", text: "They have an exam on Aug 3", confidence: 0.9 }]),
      NEURO_PARAMS,
      T0,
    );
    const threeDays = summarizeSelf(withFact, NEURO_PARAMS, T0 + 3 * 24 * HOUR);
    expect(threeDays.facts[0].salience).toBeGreaterThanOrEqual(MEM.surfaceThreshold);
  });
});

describe("memory block: persona", () => {
  it("weaves the most salient facts into the persona", () => {
    const self = createSelf(NEURO_PARAMS, undefined, T0);
    const withFacts = evolve(
      self,
      signalWithFacts([
        { key: "dog_name", text: "Their dog is called Milo.", confidence: 0.9 },
        { key: "job", text: "They work as a nurse", confidence: 0.8 },
      ]),
      NEURO_PARAMS,
      T0,
    );
    const persona = composePersona(withFacts, NEURO_PARAMS, T0);
    expect(persona).toContain("Their dog is called Milo");
    expect(persona).toContain("They work as a nurse");
  });

  it("contributes nothing when no fact clears the surface threshold", () => {
    const data: MemoryData = {
      facts: [
        { key: "job", text: "They work as a nurse", salience: MEM.surfaceThreshold - 5, lastConfirmedAt: T0 },
      ],
    };
    expect(memoryBlock.contributePersona(data, NEURO_PARAMS)).toBe("");
  });

  it("caps the persona at personaCount facts, most salient first", () => {
    const data: MemoryData = {
      facts: Array.from({ length: MEM.personaCount + 2 }, (_, i) => ({
        key: `fact_${i}`,
        text: `Fact number ${i}`,
        salience: 90 - i * 5,
        lastConfirmedAt: T0,
      })),
    };
    const persona = memoryBlock.contributePersona(data, NEURO_PARAMS);
    for (let i = 0; i < MEM.personaCount; i++) {
      expect(persona).toContain(`Fact number ${i}`);
    }
    expect(persona).not.toContain(`Fact number ${MEM.personaCount}`);
  });
});

describe("memory block: summary and hydration", () => {
  it("summarizeSelf exposes facts sorted by salience", () => {
    const self = createSelf(NEURO_PARAMS, undefined, T0);
    const withFacts = evolve(
      self,
      signalWithFacts([
        { key: "dog_name", text: "Their dog is called Milo", confidence: 0.4 },
        { key: "job", text: "They work as a nurse", confidence: 0.9 },
      ]),
      NEURO_PARAMS,
      T0,
    );
    const summary = summarizeSelf(withFacts, NEURO_PARAMS, T0);
    expect(summary.facts.map((f) => f.key)).toEqual(["job", "dog_name"]);
    expect(summary.facts[0].text).toBe("They work as a nurse");
  });

  it("hydrate auto-initializes the memory block for older persisted selves", () => {
    const legacy = createSelf(NEURO_PARAMS, undefined, T0);
    delete legacy.blocks[MEMORY_BLOCK_ID];
    const hydrated = hydrate(JSON.parse(JSON.stringify(legacy)), NEURO_PARAMS, T0 + HOUR);
    expect(hydrated.blocks[MEMORY_BLOCK_ID]).toBeDefined();
    expect(summarizeSelf(hydrated, NEURO_PARAMS, T0 + HOUR).facts).toEqual([]);
  });
});
