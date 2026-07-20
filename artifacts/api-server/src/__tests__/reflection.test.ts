/**
 * Eigenleben — server-side reflection tests.
 *
 * The pure threshold/once-per-absence/fold logic is covered in
 * @workspace/neurobrane's own suite. These tests cover the host glue:
 *   - the strict output sanitizer (a half-valid reflection is discarded)
 *   - maybeReflect's gates (short absence / empty conversation → no AI call)
 *   - the happy path (thought returned, moment + stamp persisted via queue)
 *   - once-per-absence across calls AND under a concurrent race
 *   - AI failure → null and NO state write (old check-in flow unchanged)
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { createSelf, getLastReflectedAt, NEURO_PARAMS, summarizeSelf } from "@workspace/neurobrane";
import type { InnerSelf } from "@workspace/neurobrane";

const T0 = 1_700_000_000_000;
const HOUR = 3_600_000;

const mockState = vi.hoisted(() => {
  const selves = new Map<number, unknown>();
  return {
    selves,
    createCalls: [] as unknown[],
    aiReply: null as string | null,
    aiError: null as Error | null,
    reset() {
      selves.clear();
      this.createCalls = [];
      this.aiReply = null;
      this.aiError = null;
    },
  };
});

vi.mock("@workspace/integrations-openai-ai-server", () => ({
  openai: {
    chat: {
      completions: {
        create: vi.fn(async (args: unknown) => {
          mockState.createCalls.push(args);
          if (mockState.aiError) throw mockState.aiError;
          return { choices: [{ message: { content: mockState.aiReply } }] };
        }),
      },
    },
  },
}));

vi.mock("../lib/companionSelf", () => ({
  loadOrCreateSelf: vi.fn(async (conversationId: number) => {
    if (!mockState.selves.has(conversationId)) {
      mockState.selves.set(conversationId, createSelf(NEURO_PARAMS, undefined, T0));
    }
    // Simulate the JSONB round-trip so we test plain-object hydration too.
    return JSON.parse(JSON.stringify(mockState.selves.get(conversationId)));
  }),
  saveSelf: vi.fn(async (conversationId: number, self: unknown) => {
    mockState.selves.set(conversationId, JSON.parse(JSON.stringify(self)));
  }),
}));

import { maybeReflect, sanitizeReflection } from "../lib/reflection";
import { enqueueConversationTask } from "../lib/messageSignal";
import { saveSelf } from "../lib/companionSelf";

/** Wait until the conversation's serialized queue has drained. */
function flushQueue(conversationId: number): Promise<void> {
  return enqueueConversationTask(conversationId, async () => {});
}

function storedSelf(conversationId: number): InnerSelf {
  return mockState.selves.get(conversationId) as InnerSelf;
}

const GOOD_REPLY = JSON.stringify({
  thought: "Ich habe an deinen Bruder gedacht.",
  moment: "While they were away, you kept thinking about their brother.",
});

let nextConversationId = 1;
let cid = 0;

beforeEach(() => {
  mockState.reset();
  vi.clearAllMocks();
  // A fresh conversation per test keeps the shared evolution queues isolated.
  cid = nextConversationId++;
});

describe("sanitizeReflection", () => {
  it("accepts a valid reflection and trims both fields", () => {
    expect(
      sanitizeReflection({ thought: "  I wondered about jazz.  ", moment: " A moment. " }),
    ).toEqual({ thought: "I wondered about jazz.", moment: "A moment." });
  });

  it("rejects anything that is not an object with two usable strings", () => {
    expect(sanitizeReflection(null)).toBeNull();
    expect(sanitizeReflection("a thought")).toBeNull();
    expect(sanitizeReflection([])).toBeNull();
    expect(sanitizeReflection({ thought: "only one" })).toBeNull();
    expect(sanitizeReflection({ thought: "x", moment: 42 })).toBeNull();
    expect(sanitizeReflection({ thought: "   ", moment: "m" })).toBeNull();
    expect(sanitizeReflection({ thought: "t", moment: "" })).toBeNull();
  });

  it("rejects over-long fields (runaway model output)", () => {
    expect(sanitizeReflection({ thought: "x".repeat(301), moment: "m" })).toBeNull();
    expect(sanitizeReflection({ thought: "t", moment: "m".repeat(161) })).toBeNull();
  });
});

describe("maybeReflect — gates", () => {
  it("does nothing for a short absence (no AI call, no write)", async () => {
    mockState.aiReply = GOOD_REPLY;
    const result = await maybeReflect(cid, { lastContactAt: T0, now: T0 + 2 * HOUR });
    await flushQueue(cid);

    expect(result).toBeNull();
    expect(mockState.createCalls).toHaveLength(0);
    expect(saveSelf).not.toHaveBeenCalled();
  });

  it("does nothing when the conversation has no prior contact", async () => {
    mockState.aiReply = GOOD_REPLY;
    const result = await maybeReflect(cid, { lastContactAt: null, now: T0 + 100 * HOUR });

    expect(result).toBeNull();
    expect(mockState.createCalls).toHaveLength(0);
  });
});

describe("maybeReflect — happy path", () => {
  it("returns the thought and persists moment + once-per-absence stamp", async () => {
    mockState.aiReply = GOOD_REPLY;
    const now = T0 + 10 * HOUR;

    const thought = await maybeReflect(cid, { lastContactAt: T0, now });
    await flushQueue(cid);

    expect(thought).toBe("Ich habe an deinen Bruder gedacht.");
    const self = storedSelf(cid);
    expect(getLastReflectedAt(self)).toBe(now);
    expect(summarizeSelf(self, NEURO_PARAMS, now).narrative).toContain(
      "While they were away, you kept thinking about their brother.",
    );
  });

  it("reflects only once per absence across sequential calls", async () => {
    mockState.aiReply = GOOD_REPLY;

    const first = await maybeReflect(cid, { lastContactAt: T0, now: T0 + 10 * HOUR });
    await flushQueue(cid);
    const second = await maybeReflect(cid, { lastContactAt: T0, now: T0 + 11 * HOUR });
    await flushQueue(cid);

    expect(first).not.toBeNull();
    expect(second).toBeNull();
    expect(mockState.createCalls).toHaveLength(1);
    expect(saveSelf).toHaveBeenCalledTimes(1);
  });

  it("never double-writes under a concurrent race (queue re-check)", async () => {
    mockState.aiReply = GOOD_REPLY;
    const now = T0 + 10 * HOUR;

    // Both pass the pre-AI gate before either has persisted.
    const [a, b] = await Promise.all([
      maybeReflect(cid, { lastContactAt: T0, now }),
      maybeReflect(cid, { lastContactAt: T0, now }),
    ]);
    await flushQueue(cid);

    expect(a).not.toBeNull();
    expect(b).not.toBeNull();
    // But only ONE reflection lands in the state.
    expect(saveSelf).toHaveBeenCalledTimes(1);
    const narrative = summarizeSelf(storedSelf(cid), NEURO_PARAMS, now).narrative;
    expect(
      narrative.filter((l) => l.includes("kept thinking about their brother")),
    ).toHaveLength(1);
  });
});

describe("maybeReflect — fallback", () => {
  it("returns null and writes nothing when the AI call fails", async () => {
    mockState.aiError = new Error("model unavailable");
    const warn = vi.fn();

    const result = await maybeReflect(cid, {
      lastContactAt: T0,
      now: T0 + 10 * HOUR,
      log: { warn, error: vi.fn() },
    });
    await flushQueue(cid);

    expect(result).toBeNull();
    expect(saveSelf).not.toHaveBeenCalled();
    expect(getLastReflectedAt(storedSelf(cid))).toBeNull();
    expect(warn).toHaveBeenCalled();
  });

  it("returns null and writes nothing when the model reply is malformed", async () => {
    mockState.aiReply = JSON.stringify({ thought: "only a thought, no moment" });

    const result = await maybeReflect(cid, { lastContactAt: T0, now: T0 + 10 * HOUR });
    await flushQueue(cid);

    expect(result).toBeNull();
    expect(saveSelf).not.toHaveBeenCalled();
  });

  it("returns null when the model reply is not JSON at all", async () => {
    mockState.aiReply = "I thought about jazz";

    const result = await maybeReflect(cid, { lastContactAt: T0, now: T0 + 10 * HOUR });

    expect(result).toBeNull();
    expect(saveSelf).not.toHaveBeenCalled();
  });
});
