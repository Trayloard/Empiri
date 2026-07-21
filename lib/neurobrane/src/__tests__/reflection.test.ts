/**
 * Reflection — the pure "Eigenleben" logic: when a returning absence deserves
 * a reflection (threshold + once-per-absence) and how a composed moment folds
 * into the self (narrative append with overflow→archive, timestamp stamp,
 * decay untouched).
 */

import { describe, expect, it } from "vitest";

import {
  applyReflection,
  CORE_SELF_BLOCK_ID,
  createSelf,
  getLastReflectedAt,
  hydrate,
  NEURO_PARAMS,
  REFLECTION_BLOCK_ID,
  shouldReflect,
  summarizeSelf,
  type CoreSelfData,
  type InnerSelf,
  type NarrativeLine,
} from "../index";

const T0 = 1_700_000_000_000; // fixed epoch ms for deterministic time
const HOUR = 3_600_000;
const MAX_LINES = NEURO_PARAMS.coreSelf.narrative.maxLines;
const THRESHOLD = 6;

const MOMENT = "While they were away, you kept thinking about their brother.";

function gate(lastContactAt: number | null, now: number) {
  return { lastContactAt, thresholdHours: THRESHOLD, now };
}

function coreData(self: InnerSelf): CoreSelfData {
  return self.blocks[CORE_SELF_BLOCK_ID]!.data as CoreSelfData;
}

describe("shouldReflect — threshold", () => {
  it("is false below the threshold and true at/above it", () => {
    const self = createSelf(NEURO_PARAMS, undefined, T0);
    expect(shouldReflect(self, gate(T0, T0 + 1 * HOUR))).toBe(false);
    expect(shouldReflect(self, gate(T0, T0 + (THRESHOLD - 0.01) * HOUR))).toBe(false);
    expect(shouldReflect(self, gate(T0, T0 + THRESHOLD * HOUR))).toBe(true);
    expect(shouldReflect(self, gate(T0, T0 + 48 * HOUR))).toBe(true);
  });

  it("is false when there was no prior contact at all", () => {
    const self = createSelf(NEURO_PARAMS, undefined, T0);
    expect(shouldReflect(self, gate(null, T0 + 100 * HOUR))).toBe(false);
    expect(shouldReflect(self, gate(Number.NaN, T0 + 100 * HOUR))).toBe(false);
  });
});

describe("shouldReflect — once per absence", () => {
  it("does not reflect twice on the same absence", () => {
    const lastContact = T0;
    const returnAt = T0 + 10 * HOUR;
    let self = createSelf(NEURO_PARAMS, undefined, T0);

    expect(shouldReflect(self, gate(lastContact, returnAt))).toBe(true);
    self = applyReflection(self, MOMENT, returnAt);
    // Same absence, moments later (e.g. a concurrent check-in + message).
    expect(shouldReflect(self, gate(lastContact, returnAt + 1))).toBe(false);
    expect(shouldReflect(self, gate(lastContact, returnAt + 5 * HOUR))).toBe(false);
  });

  it("reflects again once a NEW absence follows fresh contact", () => {
    let self = createSelf(NEURO_PARAMS, undefined, T0);
    self = applyReflection(self, MOMENT, T0 + 10 * HOUR);

    // The user talks again after the reflection…
    const newContact = T0 + 12 * HOUR;
    // …then disappears for another long stretch.
    expect(shouldReflect(self, gate(newContact, newContact + THRESHOLD * HOUR))).toBe(true);
    // But not if the new absence is still short.
    expect(shouldReflect(self, gate(newContact, newContact + 2 * HOUR))).toBe(false);
  });
});

describe("applyReflection", () => {
  it("appends the moment to the narrative and stamps the reflection time", () => {
    const self = createSelf(NEURO_PARAMS, undefined, T0);
    const at = T0 + 10 * HOUR;
    const after = applyReflection(self, `  ${MOMENT}  `, at);

    expect(coreData(after).narrative.map((l) => l.text)).toContain(MOMENT);
    expect(getLastReflectedAt(after)).toBe(at);
    // The input self is untouched (pure function).
    expect(coreData(self).narrative.map((l) => l.text)).not.toContain(MOMENT);
    expect(getLastReflectedAt(self)).toBeNull();
  });

  it("archives the overflowed narrative line instead of dropping it", () => {
    const self = createSelf(NEURO_PARAMS, undefined, T0);
    const lines: NarrativeLine[] = Array.from({ length: MAX_LINES }, (_, i) => ({
      text: `Old line ${i}.`,
      createdAt: 0,
    }));
    const full: InnerSelf = {
      ...self,
      blocks: {
        ...self.blocks,
        [CORE_SELF_BLOCK_ID]: {
          ...self.blocks[CORE_SELF_BLOCK_ID]!,
          data: { ...coreData(self), narrative: lines },
        },
      },
    };

    const at = T0 + 10 * HOUR;
    const after = applyReflection(full, MOMENT, at);
    const data = coreData(after);

    expect(data.narrative).toHaveLength(MAX_LINES);
    expect(data.narrative[data.narrative.length - 1].text).toBe(MOMENT);
    expect(data.narrative.map((l) => l.text)).not.toContain("Old line 0.");
    expect(data.archive).toContainEqual({ text: "Old line 0.", at, createdAt: 0 });
  });

  it("only stamps the timestamp when the moment line is empty", () => {
    const self = createSelf(NEURO_PARAMS, undefined, T0);
    const after = applyReflection(self, "   ", T0 + 10 * HOUR);
    expect(coreData(after).narrative).toEqual(coreData(self).narrative);
    expect(getLastReflectedAt(after)).toBe(T0 + 10 * HOUR);
  });

  it("does NOT swallow pending time-decay (core lastUpdatedAt untouched)", () => {
    const t1 = T0 + 12 * HOUR;
    const plain = createSelf(NEURO_PARAMS, undefined, T0);
    const reflected = applyReflection(plain, MOMENT, T0 + 10 * HOUR);

    expect(reflected.blocks[CORE_SELF_BLOCK_ID]!.lastUpdatedAt).toBe(
      plain.blocks[CORE_SELF_BLOCK_ID]!.lastUpdatedAt,
    );

    // Summaries at t1 (which project first) must show identical decay whether
    // or not a reflection happened in between — drives and traits ache the
    // same either way.
    const plainSummary = summarizeSelf(plain, NEURO_PARAMS, t1);
    const reflectedSummary = summarizeSelf(reflected, NEURO_PARAMS, t1);
    expect(reflectedSummary.drives).toEqual(plainSummary.drives);
    expect(reflectedSummary.traits).toEqual(plainSummary.traits);
  });
});

describe("persistence round-trip", () => {
  it("hydrate preserves the reflection pseudo-block byte-for-byte", () => {
    const self = applyReflection(createSelf(NEURO_PARAMS, undefined, T0), MOMENT, T0 + 10 * HOUR);
    const revived = hydrate(JSON.parse(JSON.stringify(self)), NEURO_PARAMS, T0 + 20 * HOUR);
    expect(revived.blocks[REFLECTION_BLOCK_ID]).toEqual(self.blocks[REFLECTION_BLOCK_ID]);
    expect(getLastReflectedAt(revived)).toBe(T0 + 10 * HOUR);
  });

  it("never leaks the pseudo-block into the UI summary", () => {
    const self = applyReflection(createSelf(NEURO_PARAMS, undefined, T0), MOMENT, T0 + 10 * HOUR);
    const summary = summarizeSelf(self, NEURO_PARAMS, T0 + 10 * HOUR);
    // The moment IS visible as a narrative line — but nothing else changes shape.
    expect(summary.narrative).toContain(MOMENT);
    expect(Object.keys(summary).sort()).toEqual(
      ["ageHours", "chapters", "drives", "facts", "interactions", "interests", "narrative", "traits"],
    );
  });
});
