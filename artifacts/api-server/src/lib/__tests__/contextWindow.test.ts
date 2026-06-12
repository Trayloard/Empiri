import { describe, expect, it } from "vitest";

import {
  buildContextMessages,
  CONTEXT_WINDOW_SIZE,
  getIncrementalMessagesForSummarisation,
  nextSummarizedCount,
  shouldRefreshSummary,
  SUMMARY_BATCH_SIZE,
  windowStartIndex,
} from "../contextWindow";

function makeHistory(count: number) {
  return Array.from({ length: count }, (_, i) => ({
    role: i % 2 === 0 ? "user" : "assistant",
    content: `message ${i + 1}`,
  }));
}

// ---------------------------------------------------------------------------
// buildContextMessages
// ---------------------------------------------------------------------------

describe("buildContextMessages — short history (within window)", () => {
  it("returns all messages when history fits within the window", () => {
    const history = makeHistory(10);
    const result = buildContextMessages(history, null);
    expect(result).toHaveLength(10);
    expect(result.every((m) => m.role === "user" || m.role === "assistant")).toBe(true);
  });

  it("does not inject a summary message when no contextSummary is provided", () => {
    const history = makeHistory(5);
    const result = buildContextMessages(history);
    expect(result.every((m) => m.role !== "system")).toBe(true);
  });
});

describe("buildContextMessages — long history (beyond window)", () => {
  it("caps output at CONTEXT_WINDOW_SIZE messages when no summary is given", () => {
    const history = makeHistory(CONTEXT_WINDOW_SIZE + 20);
    const result = buildContextMessages(history, null);
    expect(result).toHaveLength(CONTEXT_WINDOW_SIZE);
  });

  it("keeps only the newest messages when history exceeds the window", () => {
    const history = makeHistory(CONTEXT_WINDOW_SIZE + 10);
    const result = buildContextMessages(history, null);
    const lastContent = history[history.length - 1].content;
    expect(result[result.length - 1].content).toBe(lastContent);
  });

  it("injects a system summary message as the first element when contextSummary is provided", () => {
    const history = makeHistory(CONTEXT_WINDOW_SIZE + 5);
    const result = buildContextMessages(history, "User loves astronomy and jazz.");
    expect(result[0].role).toBe("system");
    expect(result[0].content).toContain("astronomy");
    expect(result[0].content).toContain("jazz");
  });

  it("total length is CONTEXT_WINDOW_SIZE + 1 (summary + window) when summary is provided", () => {
    const history = makeHistory(CONTEXT_WINDOW_SIZE + 20);
    const result = buildContextMessages(history, "A summary of past events.");
    expect(result).toHaveLength(CONTEXT_WINDOW_SIZE + 1);
  });

  it("window messages immediately follow the summary message", () => {
    const history = makeHistory(CONTEXT_WINDOW_SIZE + 3);
    const result = buildContextMessages(history, "Some past context.");
    const windowMessages = result.slice(1);
    expect(windowMessages).toHaveLength(CONTEXT_WINDOW_SIZE);
    expect(windowMessages[0].content).toBe(history[3].content);
    expect(windowMessages[windowMessages.length - 1].content).toBe(
      history[history.length - 1].content,
    );
  });

  it("prompt size stays bounded regardless of history length", () => {
    for (const len of [100, 500, 1000]) {
      const result = buildContextMessages(makeHistory(len), "some summary");
      // 1 system summary + CONTEXT_WINDOW_SIZE exchange messages
      expect(result.length).toBeLessThanOrEqual(CONTEXT_WINDOW_SIZE + 1);
    }
  });
});

describe("buildContextMessages — role mapping", () => {
  it("maps 'user' roles correctly", () => {
    const result = buildContextMessages([{ role: "user", content: "hello" }]);
    expect(result[0].role).toBe("user");
  });

  it("maps 'assistant' roles correctly", () => {
    const result = buildContextMessages([{ role: "assistant", content: "hi there" }]);
    expect(result[0].role).toBe("assistant");
  });

  it("maps any unrecognized role to 'user'", () => {
    const result = buildContextMessages([{ role: "unknown", content: "hmm" }]);
    expect(result[0].role).toBe("user");
  });
});

// ---------------------------------------------------------------------------
// windowStartIndex
// ---------------------------------------------------------------------------

describe("windowStartIndex", () => {
  it("is 0 for short histories that fit inside the window", () => {
    expect(windowStartIndex(5)).toBe(0);
    expect(windowStartIndex(CONTEXT_WINDOW_SIZE)).toBe(0);
  });

  it("is positive when history exceeds the window", () => {
    expect(windowStartIndex(CONTEXT_WINDOW_SIZE + 10)).toBe(10);
    expect(windowStartIndex(CONTEXT_WINDOW_SIZE + 1)).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// shouldRefreshSummary — watermark-based gating
// ---------------------------------------------------------------------------

describe("shouldRefreshSummary", () => {
  it("returns false when history still fits within the window (no overflow yet)", () => {
    expect(shouldRefreshSummary(CONTEXT_WINDOW_SIZE, null)).toBe(false);
    expect(shouldRefreshSummary(5, null)).toBe(false);
    expect(shouldRefreshSummary(CONTEXT_WINDOW_SIZE, 0)).toBe(false);
  });

  it("returns true when history overflows and no summary has been generated yet", () => {
    expect(shouldRefreshSummary(CONTEXT_WINDOW_SIZE + 1, null)).toBe(true);
    expect(shouldRefreshSummary(CONTEXT_WINDOW_SIZE + 1, 0)).toBe(true);
  });

  it("returns false when the watermark is already up to the current window start (nothing new to summarise)", () => {
    const total = CONTEXT_WINDOW_SIZE + 10;
    const alreadySummarizedUpTo = windowStartIndex(total); // = 10
    expect(shouldRefreshSummary(total, alreadySummarizedUpTo)).toBe(false);
  });

  it("returns true when new messages have slid past the watermark", () => {
    // Summarised up to message 5, but now window starts at 15 — delta of 10
    expect(shouldRefreshSummary(CONTEXT_WINDOW_SIZE + 15, 5)).toBe(true);
  });

  it("returns false even for a very long history if the watermark is current", () => {
    const total = CONTEXT_WINDOW_SIZE + 1000;
    const upToDate = windowStartIndex(total);
    expect(shouldRefreshSummary(total, upToDate)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// getIncrementalMessagesForSummarisation — bounded delta
// ---------------------------------------------------------------------------

describe("getIncrementalMessagesForSummarisation", () => {
  it("returns an empty array when history fits inside the window", () => {
    const history = makeHistory(CONTEXT_WINDOW_SIZE);
    expect(getIncrementalMessagesForSummarisation(history, null)).toHaveLength(0);
  });

  it("returns an empty array when watermark is already at the window start", () => {
    const history = makeHistory(CONTEXT_WINDOW_SIZE + 5);
    const upToDate = windowStartIndex(history.length); // = 5
    expect(getIncrementalMessagesForSummarisation(history, upToDate)).toHaveLength(0);
  });

  it("returns only the newly overflowed messages since the watermark", () => {
    const total = CONTEXT_WINDOW_SIZE + 15;
    const history = makeHistory(total);
    // Already summarised first 10 messages
    const delta = getIncrementalMessagesForSummarisation(history, 10);
    // Window now starts at 15; delta should cover indices 10..14 (5 messages)
    expect(delta).toHaveLength(5);
    expect(delta[0].content).toBe(history[10].content);
    expect(delta[delta.length - 1].content).toBe(history[14].content);
  });

  it("caps the payload at SUMMARY_BATCH_SIZE even when the delta is huge", () => {
    const bigOverflow = CONTEXT_WINDOW_SIZE + SUMMARY_BATCH_SIZE * 3;
    const history = makeHistory(bigOverflow);
    // Never summarised before — entire overflow is the delta
    const delta = getIncrementalMessagesForSummarisation(history, null);
    expect(delta.length).toBeLessThanOrEqual(SUMMARY_BATCH_SIZE);
  });

  it("delta content ends exactly at the window boundary", () => {
    const total = CONTEXT_WINDOW_SIZE + 20;
    const history = makeHistory(total);
    const delta = getIncrementalMessagesForSummarisation(history, 5);
    // Window start = 20; delta covers [5, 20) = 15 messages
    expect(delta[delta.length - 1].content).toBe(history[windowStartIndex(total) - 1].content);
  });

  it("summariser payload stays bounded across many incremental refreshes", () => {
    // Simulate a very long conversation processed incrementally
    let watermark: number | null = null;
    let totalMessages = CONTEXT_WINDOW_SIZE + 1;
    while (totalMessages <= CONTEXT_WINDOW_SIZE + SUMMARY_BATCH_SIZE * 5) {
      const history = makeHistory(totalMessages);
      if (shouldRefreshSummary(totalMessages, watermark)) {
        const delta = getIncrementalMessagesForSummarisation(history, watermark);
        expect(delta.length).toBeLessThanOrEqual(SUMMARY_BATCH_SIZE);
        watermark = nextSummarizedCount(watermark, delta.length);
      }
      totalMessages += 5;
    }
  });
});

// ---------------------------------------------------------------------------
// nextSummarizedCount
// ---------------------------------------------------------------------------

describe("nextSummarizedCount", () => {
  it("advances exactly by the delta length, not all the way to the window start", () => {
    // If watermark=0 and delta=10, new watermark is 10, not windowStart
    expect(nextSummarizedCount(0, 10)).toBe(10);
    expect(nextSummarizedCount(null, 10)).toBe(10);
    expect(nextSummarizedCount(5, 7)).toBe(12);
  });

  it("after a full single-batch catch-up, shouldRefreshSummary returns false", () => {
    const total = CONTEXT_WINDOW_SIZE + 5;
    const delta = getIncrementalMessagesForSummarisation(makeHistory(total), null);
    const newWatermark = nextSummarizedCount(null, delta.length);
    // delta covers [0, 5) so watermark=5 = windowStartIndex(total)
    expect(shouldRefreshSummary(total, newWatermark)).toBe(false);
  });

  it("after a partial batch (gap > SUMMARY_BATCH_SIZE), shouldRefreshSummary stays true", () => {
    const bigGap = CONTEXT_WINDOW_SIZE + SUMMARY_BATCH_SIZE + 10;
    const history = makeHistory(bigGap);
    const delta = getIncrementalMessagesForSummarisation(history, null);
    expect(delta).toHaveLength(SUMMARY_BATCH_SIZE); // capped
    const newWatermark = nextSummarizedCount(null, delta.length);
    // There are still 10 messages unprocessed before the window start
    expect(shouldRefreshSummary(bigGap, newWatermark)).toBe(true);
  });
});

describe("regression: large overflow gap — no messages ever skipped", () => {
  it("processes all overflowed messages via contiguous incremental batches", () => {
    // Simulate a deployment where the first summarisation call fires on a
    // conversation that already has far more messages than one batch can handle.
    const totalMessages = CONTEXT_WINDOW_SIZE + SUMMARY_BATCH_SIZE * 3 + 7;
    const history = makeHistory(totalMessages);
    const windowStart = windowStartIndex(totalMessages);

    let watermark: number | null = null;
    let iterations = 0;
    const MAX_ITER = 100; // guard against infinite loops

    while (shouldRefreshSummary(totalMessages, watermark) && iterations < MAX_ITER) {
      const delta = getIncrementalMessagesForSummarisation(history, watermark);
      expect(delta.length).toBeGreaterThan(0);
      expect(delta.length).toBeLessThanOrEqual(SUMMARY_BATCH_SIZE);
      // Delta starts exactly at the current watermark — no gaps, no skips.
      expect(delta[0].content).toBe(history[watermark ?? 0].content);
      watermark = nextSummarizedCount(watermark, delta.length);
      iterations++;
    }

    // After convergence the watermark equals the window start: all overflow processed.
    expect(watermark).toBe(windowStart);
    // shouldRefreshSummary must now be false for the same history.
    expect(shouldRefreshSummary(totalMessages, watermark)).toBe(false);
  });
});
