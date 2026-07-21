import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  CORE_SELF_BLOCK_ID,
  createSelf,
  deriveMessageSignal,
  NEURO_PARAMS,
  type CoreSelfData,
  type InnerSelf,
} from "@workspace/neurobrane";

const createMock = vi.hoisted(() => vi.fn());
const loadSelfMock = vi.hoisted(() => vi.fn());
const saveSelfMock = vi.hoisted(() => vi.fn());
const snapshotMock = vi.hoisted(() => vi.fn());

vi.mock("@workspace/integrations-openai-ai-server", () => ({
  openai: { chat: { completions: { create: createMock } } },
}));
vi.mock("../companionSelf", () => ({
  loadOrCreateSelf: loadSelfMock,
  saveSelf: saveSelfMock,
}));
vi.mock("../selfSnapshots", () => ({
  maybeSnapshotSelf: snapshotMock,
}));

import {
  enqueueConversationTask,
  queueSelfEvolution,
  resolveMessageSignal,
  sanitizeAnalyzedSignal,
  sanitizeCondensedChapter,
} from "../messageSignal";

function modelReply(payload: unknown) {
  return { choices: [{ message: { content: JSON.stringify(payload) } }] };
}

const validAnalysis = {
  topics: [{ topic: "Astrophysik", weight: 0.9 }],
  connection: 0.8,
  curiosity: 0.5,
  novelty: 0.6,
  expression: 0.4,
};

describe("sanitizeAnalyzedSignal", () => {
  it("accepts a well-formed analysis and normalizes topic keys", () => {
    const signal = sanitizeAnalyzedSignal(validAnalysis);
    expect(signal).not.toBeNull();
    expect(signal!.kind).toBe("message");
    expect(signal!.topics).toEqual(["astrophysik"]);
    expect(signal!.topicDisplays).toEqual({ astrophysik: "Astrophysik" });
    expect(signal!.topicWeights).toEqual({ astrophysik: 0.9 });
    expect(signal!.connection).toBe(0.8);
    expect(signal!.moodFactor).toBe(1);
  });

  it("rejects the whole analysis when any signal strength is missing or malformed", () => {
    expect(sanitizeAnalyzedSignal({ ...validAnalysis, connection: undefined })).toBeNull();
    expect(sanitizeAnalyzedSignal({ ...validAnalysis, curiosity: "high" })).toBeNull();
    expect(sanitizeAnalyzedSignal({ ...validAnalysis, novelty: Number.NaN })).toBeNull();
    expect(sanitizeAnalyzedSignal(null)).toBeNull();
    expect(sanitizeAnalyzedSignal([])).toBeNull();
    expect(sanitizeAnalyzedSignal("nope")).toBeNull();
  });

  it("clamps signal strengths into 0..1", () => {
    const signal = sanitizeAnalyzedSignal({
      ...validAnalysis,
      connection: 7,
      expression: -2,
    });
    expect(signal!.connection).toBe(1);
    expect(signal!.expression).toBe(0);
  });

  it("floors connection so a genuine exchange always feeds the drive a little", () => {
    const signal = sanitizeAnalyzedSignal({ ...validAnalysis, connection: 0 });
    expect(signal!.connection).toBe(0.4);
    // Above the floor the model's value passes through untouched.
    expect(sanitizeAnalyzedSignal(validAnalysis)!.connection).toBe(0.8);
  });

  it("allows an empty topic list (filler messages grow no interests)", () => {
    const signal = sanitizeAnalyzedSignal({ ...validAnalysis, topics: [] });
    expect(signal!.topics).toEqual([]);
  });

  it("drops malformed, empty, oversized, and zero-weight topics", () => {
    const signal = sanitizeAnalyzedSignal({
      ...validAnalysis,
      topics: [
        "just-a-string",
        { topic: "", weight: 0.5 },
        { topic: "x".repeat(50), weight: 0.5 },
        { topic: "Jazz", weight: 0 },
        { topic: "Hiking", weight: "strong" },
        { topic: "Berlin", weight: 0.7 },
      ],
    });
    expect(signal!.topics).toEqual(["berlin"]);
  });

  it("merges duplicate keys (casing variants) keeping the stronger weight", () => {
    const signal = sanitizeAnalyzedSignal({
      ...validAnalysis,
      topics: [
        { topic: "jazz", weight: 0.4 },
        { topic: "Jazz", weight: 0.9 },
      ],
    });
    expect(signal!.topics).toEqual(["jazz"]);
    expect(signal!.topicWeights).toEqual({ jazz: 0.9 });
    // First occurrence set the display; dedup never splits the interest.
    expect(signal!.topicDisplays).toEqual({ jazz: "jazz" });
  });

  it("caps the number of topics at three", () => {
    const signal = sanitizeAnalyzedSignal({
      ...validAnalysis,
      topics: [
        { topic: "Jazz", weight: 0.9 },
        { topic: "Hiking", weight: 0.8 },
        { topic: "Berlin", weight: 0.7 },
        { topic: "Cooking", weight: 0.6 },
      ],
    });
    expect(signal!.topics).toEqual(["jazz", "hiking", "berlin"]);
  });

  it("passes through well-formed facts with normalized snake_case keys", () => {
    const signal = sanitizeAnalyzedSignal({
      ...validAnalysis,
      facts: [
        { key: "Dog Name", text: "  Their dog is called Milo ", confidence: 0.9 },
        { key: "exam-date", text: "They have an exam on Aug 3", confidence: 0.7 },
      ],
    });
    expect(signal!.facts).toEqual([
      { key: "dog_name", text: "Their dog is called Milo", confidence: 0.9 },
      { key: "exam_date", text: "They have an exam on Aug 3", confidence: 0.7 },
    ]);
  });

  it("omits the facts field entirely when none are usable", () => {
    expect(sanitizeAnalyzedSignal(validAnalysis)!.facts).toBeUndefined();
    expect(sanitizeAnalyzedSignal({ ...validAnalysis, facts: [] })!.facts).toBeUndefined();
    expect(
      sanitizeAnalyzedSignal({ ...validAnalysis, facts: "not an array" })!.facts,
    ).toBeUndefined();
  });

  it("skips malformed fact entries individually without rejecting the analysis", () => {
    const signal = sanitizeAnalyzedSignal({
      ...validAnalysis,
      facts: [
        "just-a-string",
        { key: "", text: "No key", confidence: 0.9 },
        { key: "job", text: "", confidence: 0.9 },
        { key: "novel", text: "x".repeat(300), confidence: 0.9 },
        { key: "mood", text: "They feel happy", confidence: 0 },
        { key: "pet", text: "They have a cat", confidence: "high" },
        { key: "dog_name", text: "Their dog is called Milo", confidence: 0.9 },
      ],
    });
    expect(signal).not.toBeNull();
    expect(signal!.facts).toEqual([
      { key: "dog_name", text: "Their dog is called Milo", confidence: 0.9 },
    ]);
  });

  it("dedupes facts whose keys collide after normalization and caps at three", () => {
    const signal = sanitizeAnalyzedSignal({
      ...validAnalysis,
      facts: [
        { key: "dog_name", text: "Their dog is called Milo", confidence: 0.9 },
        { key: "Dog-Name", text: "A duplicate slot", confidence: 0.8 },
        { key: "job", text: "They work as a nurse", confidence: 0.8 },
        { key: "home_city", text: "They live in Berlin", confidence: 0.7 },
        { key: "partner_name", text: "Their partner is Alex", confidence: 0.7 },
      ],
    });
    expect(signal!.facts!.map((f) => f.key)).toEqual(["dog_name", "job", "home_city"]);
  });
});

describe("resolveMessageSignal", () => {
  beforeEach(() => {
    createMock.mockReset();
  });

  it("returns the model's analysis when it is valid", async () => {
    createMock.mockResolvedValueOnce(modelReply(validAnalysis));
    const signal = await resolveMessageSignal("Ich liebe Astrophysik!");
    expect(signal.topics).toEqual(["astrophysik"]);
    expect(signal.topicWeights).toEqual({ astrophysik: 0.9 });
  });

  it("falls back to the heuristic when the model call throws", async () => {
    createMock.mockRejectedValueOnce(new Error("model down"));
    const content = "Tell me about astronomy and Paris";
    const signal = await resolveMessageSignal(content);
    expect(signal).toEqual(deriveMessageSignal(content));
  });

  it("falls back to the heuristic when the model returns malformed JSON", async () => {
    createMock.mockResolvedValueOnce({
      choices: [{ message: { content: "not json at all" } }],
    });
    const content = "Tell me about astronomy";
    const signal = await resolveMessageSignal(content);
    expect(signal).toEqual(deriveMessageSignal(content));
  });

  it("falls back to the heuristic when the analysis fails validation", async () => {
    createMock.mockResolvedValueOnce(modelReply({ topics: [], connection: "high" }));
    const content = "Guten Morgen!";
    const signal = await resolveMessageSignal(content);
    expect(signal).toEqual(deriveMessageSignal(content));
  });
});

describe("enqueueConversationTask", () => {
  it("runs tasks for the same conversation strictly in order", async () => {
    const order: string[] = [];
    let releaseFirst!: () => void;
    const firstGate = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });

    const first = enqueueConversationTask(1, async () => {
      order.push("first:start");
      await firstGate;
      order.push("first:end");
    });
    const second = enqueueConversationTask(1, async () => {
      order.push("second:start");
    });

    // Give the second task a chance to (incorrectly) start early.
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(order).toEqual(["first:start"]);

    releaseFirst();
    await Promise.all([first, second]);
    expect(order).toEqual(["first:start", "first:end", "second:start"]);
  });

  it("keeps the chain alive after a task rejects", async () => {
    const order: string[] = [];
    await enqueueConversationTask(2, async () => {
      throw new Error("boom");
    });
    await enqueueConversationTask(2, async () => {
      order.push("after-failure");
    });
    expect(order).toEqual(["after-failure"]);
  });

  it("does not serialize across different conversations", async () => {
    const order: string[] = [];
    let releaseA!: () => void;
    const gateA = new Promise<void>((resolve) => {
      releaseA = resolve;
    });

    const a = enqueueConversationTask(3, async () => {
      await gateA;
      order.push("a");
    });
    const b = enqueueConversationTask(4, async () => {
      order.push("b");
    });

    await b;
    expect(order).toEqual(["b"]);
    releaseA();
    await a;
    expect(order).toEqual(["b", "a"]);
  });
});

describe("sanitizeCondensedChapter", () => {
  it("accepts a well-formed chapter and normalizes themes", () => {
    const chapter = sanitizeCondensedChapter({
      text: "  Back in early July you dove deep into jazz. ",
      themes: ["Jazz", "JAZZ", "Live-Musik", 42, ""],
    });
    expect(chapter).toEqual({
      text: "Back in early July you dove deep into jazz.",
      themes: ["jazz", "live-musik"],
    });
  });

  it("caps themes at three", () => {
    const chapter = sanitizeCondensedChapter({
      text: "A chapter.",
      themes: ["one", "two", "three", "four"],
    });
    expect(chapter!.themes).toEqual(["one", "two", "three"]);
  });

  it("rejects chapters without usable text", () => {
    expect(sanitizeCondensedChapter(null)).toBeNull();
    expect(sanitizeCondensedChapter([])).toBeNull();
    expect(sanitizeCondensedChapter({ themes: ["jazz"] })).toBeNull();
    expect(sanitizeCondensedChapter({ text: "   " })).toBeNull();
    expect(sanitizeCondensedChapter({ text: "x".repeat(400) })).toBeNull();
  });

  it("tolerates missing or malformed themes", () => {
    expect(sanitizeCondensedChapter({ text: "A chapter." })!.themes).toEqual([]);
    expect(sanitizeCondensedChapter({ text: "A chapter.", themes: "jazz" })!.themes).toEqual([]);
  });
});

describe("queueSelfEvolution: biography condensation", () => {
  const T0 = 1_700_000_000_000;
  const DAY = 86_400_000;
  const THRESHOLD = NEURO_PARAMS.coreSelf.biography.condenseThreshold;

  const validAnalysisReply = modelReply({
    topics: [],
    connection: 0.5,
    curiosity: 0.3,
    novelty: 0.2,
    expression: 0.3,
  });

  function coreData(self: InnerSelf): CoreSelfData {
    return self.blocks[CORE_SELF_BLOCK_ID]!.data as CoreSelfData;
  }

  function selfWithArchive(count: number): InnerSelf {
    const self = createSelf(NEURO_PARAMS, undefined, T0);
    const envelope = self.blocks[CORE_SELF_BLOCK_ID]!;
    const data = envelope.data as CoreSelfData;
    envelope.data = {
      ...data,
      archive: Array.from({ length: count }, (_, i) => ({
        text: `archived line ${i}`,
        at: T0 + i * DAY,
      })),
    };
    return self;
  }

  beforeEach(() => {
    createMock.mockReset();
    loadSelfMock.mockReset();
    saveSelfMock.mockReset();
    snapshotMock.mockReset();
    // The mock store mirrors reality: loads return the most recently saved self.
    const saved: InnerSelf[] = [];
    saveSelfMock.mockImplementation(async (_id: number, self: InnerSelf) => {
      saved.push(self);
    });
    snapshotMock.mockResolvedValue(undefined);
    loadSelfMock.mockImplementation(async () =>
      saved.length > 0 ? saved[saved.length - 1] : selfWithArchive(THRESHOLD),
    );
  });

  it("condenses a full archive into a dated chapter and consumes the lines", async () => {
    createMock
      .mockResolvedValueOnce(validAnalysisReply)
      .mockResolvedValueOnce(
        modelReply({ text: "Back then you talked a lot about jazz.", themes: ["Jazz"] }),
      );

    await queueSelfEvolution(1, "Hallo!");

    expect(createMock).toHaveBeenCalledTimes(2);
    expect(saveSelfMock).toHaveBeenCalledTimes(2);
    const finalSelf = saveSelfMock.mock.calls[1][1] as InnerSelf;
    const core = coreData(finalSelf);
    expect(core.archive).toEqual([]);
    expect(core.chapters).toHaveLength(1);
    expect(core.chapters[0]).toEqual({
      from: T0,
      to: T0 + (THRESHOLD - 1) * DAY,
      text: "Back then you talked a lot about jazz.",
      themes: ["jazz"],
      sourceLines: Array.from({ length: THRESHOLD }, (_, i) => `archived line ${i}`),
      memoryDate: T0,
    });
  });

  it("does nothing below the condensation threshold", async () => {
    loadSelfMock.mockImplementation(async () => selfWithArchive(THRESHOLD - 1));
    createMock.mockResolvedValueOnce(validAnalysisReply);

    await queueSelfEvolution(2, "Hallo!");

    // Only the analysis call ran; no condensation, one save.
    expect(createMock).toHaveBeenCalledTimes(1);
    expect(saveSelfMock).toHaveBeenCalledTimes(1);
  });

  it("leaves the archive intact when the condensation AI call fails (fallback)", async () => {
    createMock
      .mockResolvedValueOnce(validAnalysisReply)
      .mockRejectedValueOnce(new Error("model down"));
    const log = { warn: vi.fn(), error: vi.fn() };

    await queueSelfEvolution(3, "Hallo!", log);

    expect(saveSelfMock).toHaveBeenCalledTimes(1);
    const savedSelf = saveSelfMock.mock.calls[0][1] as InnerSelf;
    expect(coreData(savedSelf).archive).toHaveLength(THRESHOLD);
    expect(coreData(savedSelf).chapters).toEqual([]);
    expect(log.warn).toHaveBeenCalled();
    expect(log.error).not.toHaveBeenCalled();
  });

  it("leaves the archive intact when the condensation reply fails validation", async () => {
    createMock
      .mockResolvedValueOnce(validAnalysisReply)
      .mockResolvedValueOnce(modelReply({ themes: ["jazz"] }));
    const log = { warn: vi.fn(), error: vi.fn() };

    await queueSelfEvolution(4, "Hallo!", log);

    expect(saveSelfMock).toHaveBeenCalledTimes(1);
    expect(log.warn).toHaveBeenCalled();
  });
});
