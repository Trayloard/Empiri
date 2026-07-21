import { beforeEach, describe, expect, it, vi } from "vitest";
import { createSelf, NEURO_PARAMS, type InnerSelf } from "@workspace/neurobrane";

const createMock = vi.hoisted(() => vi.fn());
const loadSelfMock = vi.hoisted(() => vi.fn());
const saveSelfMock = vi.hoisted(() => vi.fn());

vi.mock("@workspace/integrations-openai-ai-server", () => ({
  openai: { chat: { completions: { create: createMock } } },
}));
vi.mock("../companionSelf", () => ({
  loadOrCreateSelf: loadSelfMock,
  saveSelf: saveSelfMock,
}));
vi.mock("../messageSignal", () => ({
  enqueueConversationTask: vi.fn((_id: number, task: () => Promise<void>) => task()),
}));

import {
  buildReflectionDigest,
  maybeReflect,
  REFLECTION_MIN_HOURS,
  sanitizeReflection,
} from "../reflection";

const T0 = 1_700_000_000_000;
const LONG_ABSENCE_MS = (REFLECTION_MIN_HOURS + 1) * 3_600_000;

function baseSelf(): InnerSelf {
  return createSelf(NEURO_PARAMS, undefined, T0);
}

function modelReply(payload: unknown) {
  return { choices: [{ message: { content: JSON.stringify(payload) } }] };
}

beforeEach(() => {
  vi.clearAllMocks();
  loadSelfMock.mockResolvedValue(baseSelf());
  saveSelfMock.mockResolvedValue(undefined);
});

// ── sanitizeReflection ────────────────────────────────────────────────────────

describe("sanitizeReflection", () => {
  it("accepts a well-formed reflection", () => {
    const result = sanitizeReflection({
      thought: "I kept thinking about what you told me.",
      moment: "While they were away, you thought about the user.",
    });
    expect(result).toEqual({
      thought: "I kept thinking about what you told me.",
      moment: "While they were away, you thought about the user.",
    });
  });

  it("trims whitespace from both fields", () => {
    const result = sanitizeReflection({
      thought: "  A thought.  ",
      moment: "  A moment.  ",
    });
    expect(result?.thought).toBe("A thought.");
    expect(result?.moment).toBe("A moment.");
  });

  it("returns null for non-object input", () => {
    expect(sanitizeReflection(null)).toBeNull();
    expect(sanitizeReflection("string")).toBeNull();
    expect(sanitizeReflection([])).toBeNull();
    expect(sanitizeReflection(42)).toBeNull();
  });

  it("returns null when thought is missing or not a string", () => {
    expect(sanitizeReflection({ moment: "A moment." })).toBeNull();
    expect(sanitizeReflection({ thought: 42, moment: "A moment." })).toBeNull();
  });

  it("returns null when moment is missing or not a string", () => {
    expect(sanitizeReflection({ thought: "A thought." })).toBeNull();
    expect(sanitizeReflection({ thought: "A thought.", moment: null })).toBeNull();
  });

  it("returns null when thought is empty after trimming", () => {
    expect(sanitizeReflection({ thought: "   ", moment: "A moment." })).toBeNull();
  });

  it("returns null when thought exceeds the character cap", () => {
    expect(
      sanitizeReflection({ thought: "x".repeat(301), moment: "A moment." }),
    ).toBeNull();
  });

  it("accepts thought at exactly the cap (300 chars)", () => {
    expect(
      sanitizeReflection({ thought: "x".repeat(300), moment: "A moment." }),
    ).not.toBeNull();
  });

  it("returns null when moment exceeds the character cap", () => {
    expect(
      sanitizeReflection({ thought: "A thought.", moment: "x".repeat(161) }),
    ).toBeNull();
  });

  it("accepts moment at exactly the cap (160 chars)", () => {
    expect(
      sanitizeReflection({ thought: "A thought.", moment: "x".repeat(160) }),
    ).not.toBeNull();
  });
});

// ── buildReflectionDigest ─────────────────────────────────────────────────────

describe("buildReflectionDigest", () => {
  it("includes the hours-away text when under a day", () => {
    const digest = buildReflectionDigest(baseSelf(), 7);
    expect(digest).toContain("about 7 hour(s)");
  });

  it("switches to days when away >= 24 hours", () => {
    const digest = buildReflectionDigest(baseSelf(), 48);
    expect(digest).toContain("about 2 day(s)");
  });

  it("clamps fractional hours to at least 1", () => {
    const digest = buildReflectionDigest(baseSelf(), 0.1);
    expect(digest).toContain("about 1 hour(s)");
  });

  it("produces a non-empty string for a fresh self with no history", () => {
    const digest = buildReflectionDigest(baseSelf(), 10);
    expect(typeof digest).toBe("string");
    expect(digest.length).toBeGreaterThan(0);
  });
});

// ── maybeReflect ──────────────────────────────────────────────────────────────

describe("maybeReflect", () => {
  const now = T0 + LONG_ABSENCE_MS;
  const lastContactAt = T0;

  it("returns the thought when the model produces a valid reflection", async () => {
    createMock.mockResolvedValueOnce(
      modelReply({ thought: "I missed you.", moment: "While away, you missed them." }),
    );

    const thought = await maybeReflect(1, { lastContactAt, now });
    expect(thought).toBe("I missed you.");
  });

  it("returns null when the absence is too short", async () => {
    const shortAbsenceMs = (REFLECTION_MIN_HOURS - 1) * 3_600_000;
    const thought = await maybeReflect(1, {
      lastContactAt: T0,
      now: T0 + shortAbsenceMs,
    });
    expect(thought).toBeNull();
    expect(createMock).not.toHaveBeenCalled();
  });

  it("returns null when lastContactAt is null", async () => {
    const thought = await maybeReflect(1, { lastContactAt: null, now });
    expect(thought).toBeNull();
    expect(createMock).not.toHaveBeenCalled();
  });

  it("returns null and does not throw when the model call fails", async () => {
    createMock.mockRejectedValueOnce(new Error("network error"));
    const thought = await maybeReflect(1, { lastContactAt, now });
    expect(thought).toBeNull();
  });

  it("returns null when the model returns malformed JSON", async () => {
    createMock.mockResolvedValueOnce({
      choices: [{ message: { content: "not json" } }],
    });
    const thought = await maybeReflect(1, { lastContactAt, now });
    expect(thought).toBeNull();
  });

  it("returns null when the model returns a reflection that fails validation", async () => {
    createMock.mockResolvedValueOnce(modelReply({ thought: "", moment: "m" }));
    const thought = await maybeReflect(1, { lastContactAt, now });
    expect(thought).toBeNull();
  });

  it("skips reflection when the self shows it was already reflected during this absence", async () => {
    const alreadyReflected = {
      ...baseSelf(),
      blocks: {
        ...baseSelf().blocks,
        reflection: {
          version: 1,
          lastUpdatedAt: T0 + 100,
          data: { lastReflectedAt: T0 + 100 },
        },
      },
    };
    loadSelfMock.mockResolvedValue(alreadyReflected);

    const thought = await maybeReflect(1, { lastContactAt, now });
    expect(thought).toBeNull();
    expect(createMock).not.toHaveBeenCalled();
  });

  it("persists the narrative moment through the evolution queue on success", async () => {
    createMock.mockResolvedValueOnce(
      modelReply({ thought: "I missed you.", moment: "While away, you missed them." }),
    );
    await maybeReflect(1, { lastContactAt, now });
    expect(saveSelfMock).toHaveBeenCalledOnce();
  });
});

// ── timeout guard (parallel execution pattern) ────────────────────────────────

describe("reflection timeout guard", () => {
  it("resolves immediately when maybeReflect returns fast", async () => {
    const fastResult = Promise.resolve("fast thought");
    const TIMEOUT_MS = 1500;

    const result = await Promise.race([
      fastResult,
      new Promise<null>((resolve) => setTimeout(() => resolve(null), TIMEOUT_MS)),
    ]);

    expect(result).toBe("fast thought");
  });

  it("resolves null when the reflection takes longer than the timeout", async () => {
    vi.useFakeTimers();

    const slowResult = new Promise<string>((resolve) => {
      setTimeout(() => resolve("slow thought"), 5000);
    });
    const TIMEOUT_MS = 1500;

    const racePromise = Promise.race([
      slowResult,
      new Promise<null>((resolve) => setTimeout(() => resolve(null), TIMEOUT_MS)),
    ]);

    await vi.advanceTimersByTimeAsync(TIMEOUT_MS + 1);
    const result = await racePromise;
    expect(result).toBeNull();

    vi.useRealTimers();
  });
});
