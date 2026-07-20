import { beforeEach, describe, expect, it, vi } from "vitest";
import { deriveMessageSignal } from "@workspace/neurobrane";

const createMock = vi.hoisted(() => vi.fn());

vi.mock("@workspace/integrations-openai-ai-server", () => ({
  openai: { chat: { completions: { create: createMock } } },
}));

import {
  enqueueConversationTask,
  resolveMessageSignal,
  sanitizeAnalyzedSignal,
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
