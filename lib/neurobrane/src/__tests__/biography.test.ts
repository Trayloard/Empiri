import { describe, expect, it } from "vitest";

import {
  applyChapter,
  composePersona,
  CORE_SELF_BLOCK_ID,
  coreSelfBlock,
  createSelf,
  NEURO_PARAMS,
  normalizeCoreSelf,
  pendingBiographyLines,
  selectPersonaChapters,
  summarizeSelf,
  type Chapter,
  type CoreSelfData,
  type InnerSelf,
  type InteractionSignal,
} from "../index";

const T0 = 1_700_000_000_000; // fixed epoch ms for deterministic time
const DAY = 86_400_000;
const BIO = NEURO_PARAMS.coreSelf.biography;
const MAX_LINES = NEURO_PARAMS.coreSelf.narrative.maxLines;

const CTX = { now: T0, elapsedMs: 0, weight: 1 };

function baseSignal(topics: string[] = []): InteractionSignal {
  return {
    kind: "message",
    connection: 0.5,
    curiosity: 0.3,
    novelty: 0,
    expression: 0.3,
    topics,
    moodFactor: 1,
  };
}

function coreData(overrides: Partial<CoreSelfData> = {}): CoreSelfData {
  return {
    traits: { warmth: 70 },
    interests: [],
    narrative: [],
    archive: [],
    chapters: [],
    ...overrides,
  };
}

function chapter(overrides: Partial<Chapter> = {}): Chapter {
  return {
    from: T0,
    to: T0 + DAY,
    text: "Back then you talked a lot about jazz.",
    themes: ["jazz"],
    ...overrides,
  };
}

function selfWithCore(data: CoreSelfData, now: number = T0): InnerSelf {
  const self = createSelf(NEURO_PARAMS, undefined, now);
  return {
    ...self,
    blocks: {
      ...self.blocks,
      [CORE_SELF_BLOCK_ID]: {
        ...self.blocks[CORE_SELF_BLOCK_ID]!,
        data,
      },
    },
  };
}

/** A signal + data pair whose fold pushes ONE new narrative line. */
function crossingSetup(narrative: string[]) {
  // affinity 50 + reinforceGain 11 crosses newInterestThreshold 55.
  const data = coreData({
    interests: [{ topic: "jazz", affinity: 50, display: "Jazz" }],
    narrative,
  });
  return { data, signal: baseSignal(["jazz"]) };
}

describe("core-self: narrative overflow archiving", () => {
  it("archives (dated) the lines that slide out instead of dropping them", () => {
    const lines = Array.from({ length: MAX_LINES }, (_, i) => `line ${i}`);
    const { data, signal } = crossingSetup(lines);

    const next = coreSelfBlock.applyInteraction(data, signal, NEURO_PARAMS, CTX);

    expect(next.narrative).toHaveLength(MAX_LINES);
    expect(next.narrative[next.narrative.length - 1]).toContain("jazz");
    expect(next.archive).toEqual([{ text: "line 0", at: T0 }]);
  });

  it("does not archive anything while the narrative is below its cap", () => {
    const { data, signal } = crossingSetup(["line 0"]);
    const next = coreSelfBlock.applyInteraction(data, signal, NEURO_PARAMS, CTX);
    expect(next.narrative).toHaveLength(2);
    expect(next.archive).toEqual([]);
  });

  it("caps the archive by dropping the oldest entries (the AI-less fallback)", () => {
    const archive = Array.from({ length: BIO.archiveMax }, (_, i) => ({
      text: `old ${i}`,
      at: T0 - (BIO.archiveMax - i) * DAY,
    }));
    const lines = Array.from({ length: MAX_LINES }, (_, i) => `line ${i}`);
    const { data, signal } = crossingSetup(lines);
    data.archive = archive;

    const next = coreSelfBlock.applyInteraction(data, signal, NEURO_PARAMS, CTX);

    expect(next.archive).toHaveLength(BIO.archiveMax);
    expect(next.archive[0].text).toBe("old 1");
    expect(next.archive[next.archive.length - 1]).toEqual({ text: "line 0", at: T0 });
  });
});

describe("core-self: legacy state migration", () => {
  const legacy = {
    traits: { warmth: 70 },
    interests: [{ topic: "jazz", affinity: 60, display: "Jazz" }],
    narrative: ["an old line"],
  } as unknown as CoreSelfData;

  it("normalizeCoreSelf fills missing biography fields with empties", () => {
    const normalized = normalizeCoreSelf(legacy);
    expect(normalized.archive).toEqual([]);
    expect(normalized.chapters).toEqual([]);
    expect(normalized.narrative).toEqual(["an old line"]);
  });

  it("applyInteraction and decay preserve archive and chapters", () => {
    const data = coreData({
      archive: [{ text: "kept", at: T0 - DAY }],
      chapters: [chapter()],
    });
    const afterFold = coreSelfBlock.applyInteraction(data, baseSignal(), NEURO_PARAMS, CTX);
    expect(afterFold.archive).toEqual(data.archive);
    expect(afterFold.chapters).toEqual(data.chapters);

    const afterDecay = coreSelfBlock.decay(afterFold, NEURO_PARAMS, {
      now: T0 + DAY,
      elapsedMs: DAY,
      weight: 1,
    });
    expect(afterDecay.archive).toEqual(data.archive);
    expect(afterDecay.chapters).toEqual(data.chapters);
  });

  it("legacy data flows through applyInteraction and decay without crashing", () => {
    const afterFold = coreSelfBlock.applyInteraction(legacy, baseSignal(), NEURO_PARAMS, CTX);
    expect(afterFold.archive).toEqual([]);
    expect(afterFold.chapters).toEqual([]);

    const afterDecay = coreSelfBlock.decay(legacy, NEURO_PARAMS, {
      now: T0 + DAY,
      elapsedMs: DAY,
      weight: 1,
    });
    expect(afterDecay.archive).toEqual([]);
    expect(afterDecay.chapters).toEqual([]);
  });
});

describe("pendingBiographyLines", () => {
  it("returns nothing below the condensation threshold", () => {
    const archive = Array.from({ length: BIO.condenseThreshold - 1 }, (_, i) => ({
      text: `line ${i}`,
      at: T0 + i,
    }));
    const self = selfWithCore(coreData({ archive }));
    expect(pendingBiographyLines(self)).toEqual([]);
  });

  it("returns the whole archive, oldest first, once the threshold is reached", () => {
    const archive = Array.from({ length: BIO.condenseThreshold }, (_, i) => ({
      text: `line ${i}`,
      at: T0 + i,
    }));
    const self = selfWithCore(coreData({ archive }));
    expect(pendingBiographyLines(self)).toEqual(archive);
  });

  it("is safe on a self without a core-self block", () => {
    const self = selfWithCore(coreData());
    delete self.blocks[CORE_SELF_BLOCK_ID];
    expect(pendingBiographyLines(self)).toEqual([]);
  });
});

describe("applyChapter", () => {
  it("appends the chapter and consumes the condensed archive entries", () => {
    const archive = Array.from({ length: 5 }, (_, i) => ({ text: `line ${i}`, at: T0 + i }));
    const self = selfWithCore(coreData({ archive }));

    const next = applyChapter(self, chapter(), 4, NEURO_PARAMS, T0 + DAY);
    const core = next.blocks[CORE_SELF_BLOCK_ID]!.data as CoreSelfData;

    expect(core.chapters).toHaveLength(1);
    expect(core.chapters[0].text).toContain("jazz");
    expect(core.archive).toEqual([{ text: "line 4", at: T0 + 4 }]);
    expect(next.blocks[CORE_SELF_BLOCK_ID]!.lastUpdatedAt).toBe(T0 + DAY);
    // The original self is untouched (pure).
    const originalCore = self.blocks[CORE_SELF_BLOCK_ID]!.data as CoreSelfData;
    expect(originalCore.archive).toHaveLength(5);
    expect(originalCore.chapters).toHaveLength(0);
  });

  it("caps the chapter list by dropping the earliest chapters", () => {
    const chapters = Array.from({ length: BIO.maxChapters }, (_, i) =>
      chapter({ from: T0 + i * DAY, to: T0 + (i + 1) * DAY, text: `chapter ${i}` }),
    );
    const self = selfWithCore(coreData({ chapters }));

    const next = applyChapter(
      self,
      chapter({ from: T0 + 400 * DAY, to: T0 + 401 * DAY, text: "the newest chapter" }),
      0,
      NEURO_PARAMS,
      T0,
    );
    const core = next.blocks[CORE_SELF_BLOCK_ID]!.data as CoreSelfData;

    expect(core.chapters).toHaveLength(BIO.maxChapters);
    expect(core.chapters[0].text).toBe("chapter 1");
    expect(core.chapters[core.chapters.length - 1].text).toBe("the newest chapter");
  });

  it("never consumes more archive entries than exist (stale-safe)", () => {
    const self = selfWithCore(coreData({ archive: [{ text: "only", at: T0 }] }));
    const next = applyChapter(self, chapter(), 99, NEURO_PARAMS, T0);
    const core = next.blocks[CORE_SELF_BLOCK_ID]!.data as CoreSelfData;
    expect(core.archive).toEqual([]);
    expect(core.chapters).toHaveLength(1);
  });
});

describe("persona chapter selection", () => {
  const older = chapter({
    from: T0 - 60 * DAY,
    to: T0 - 50 * DAY,
    text: "Early that summer you dove deep into jazz",
    themes: ["jazz"],
  });
  const middle = chapter({
    from: T0 - 30 * DAY,
    to: T0 - 20 * DAY,
    text: "Later you were all about hiking",
    themes: ["hiking"],
  });
  const latest = chapter({
    from: T0 - 10 * DAY,
    to: T0 - 5 * DAY,
    text: "Recently your job change filled the conversations",
    themes: ["job"],
  });

  it("always picks the most recent chapter", () => {
    const data = coreData({ chapters: [older, middle, latest] });
    const chosen = selectPersonaChapters(data, NEURO_PARAMS);
    expect(chosen.map((c) => c.text)).toContain(latest.text);
    expect(chosen.length).toBeLessThanOrEqual(BIO.personaChapters);
  });

  it("adds an older chapter only when its theme matches a surfaced interest", () => {
    const data = coreData({
      interests: [{ topic: "jazz", affinity: 80, display: "Jazz" }],
      chapters: [older, middle, latest],
    });
    const chosen = selectPersonaChapters(data, NEURO_PARAMS);
    expect(chosen.map((c) => c.text)).toEqual([older.text, latest.text]); // oldest first
  });

  it("skips older chapters whose themes no longer resonate", () => {
    const data = coreData({
      interests: [{ topic: "cooking", affinity: 80, display: "Cooking" }],
      chapters: [older, middle, latest],
    });
    const chosen = selectPersonaChapters(data, NEURO_PARAMS);
    expect(chosen).toHaveLength(1);
    expect(chosen[0].text).toBe(latest.text);
  });

  it("weaves the chosen chapters into the composed persona", () => {
    const self = selfWithCore(coreData({ chapters: [latest] }));
    const persona = composePersona(self, NEURO_PARAMS, T0);
    expect(persona).toContain("Recently your job change filled the conversations");
  });

  it("contributes no chapter sentence when there are none", () => {
    const self = selfWithCore(coreData());
    const persona = composePersona(self, NEURO_PARAMS, T0);
    expect(persona).not.toContain("story together");
  });
});

describe("summarizeSelf", () => {
  it("exposes chapters oldest-first in the friendly summary", () => {
    const late = chapter({ from: T0 + 10 * DAY, to: T0 + 11 * DAY, text: "later" });
    const early = chapter({ from: T0 - 10 * DAY, to: T0 - 9 * DAY, text: "earlier" });
    const self = selfWithCore(coreData({ chapters: [late, early] }));
    const summary = summarizeSelf(self, NEURO_PARAMS, T0);
    expect(summary.chapters.map((c) => c.text)).toEqual(["earlier", "later"]);
  });

  it("returns an empty chapters array for a legacy self", () => {
    const legacy = selfWithCore({
      traits: { warmth: 70 },
      interests: [],
      narrative: [],
    } as unknown as CoreSelfData);
    const summary = summarizeSelf(legacy, NEURO_PARAMS, T0);
    expect(summary.chapters).toEqual([]);
  });
});
