/**
 * contextWindow.ts
 *
 * Keeps the model prompt within a fixed, token-safe message window.
 * Older messages that slide out of the window are condensed into a compact
 * running "memory" note injected as a system message, so long-term context
 * isn't abruptly dropped as the conversation grows.
 *
 * Design principles
 * -----------------
 * 1. The live prompt always contains at most CONTEXT_WINDOW_SIZE exchange
 *    messages — the newest ones.
 * 2. A rolling summary covers everything before the window.  It is updated
 *    *incrementally*: each refresh folds only the newly overflowed messages
 *    (the delta since the last watermark) into the existing summary.  The
 *    summariser's input is therefore bounded by SUMMARY_BATCH_SIZE regardless
 *    of how long the conversation grows.
 * 3. A watermark (lastSummarizedCount) records how many messages were in the
 *    history at the time of the last summary.  A refresh is only triggered
 *    when genuinely new messages have slid past the window boundary since that
 *    watermark — not on every turn.
 *
 * All exported functions are pure and synchronous — no I/O, fully unit-testable.
 */

export type RoleMessage = {
  role: "user" | "assistant" | "system";
  content: string;
};

export type HistoryMessage = {
  role: string;
  content: string;
};

/** Number of most-recent exchange messages forwarded to the model verbatim. */
export const CONTEXT_WINDOW_SIZE = 40;

/**
 * Maximum number of newly overflowed messages fed into a single incremental
 * summarisation call.  Caps the summariser's input regardless of history size.
 */
export const SUMMARY_BATCH_SIZE = 40;

// ---------------------------------------------------------------------------
// Prompt assembly
// ---------------------------------------------------------------------------

/**
 * Build the ordered role-messages to send to the model.
 *
 * The caller is responsible for prepending the persona system message.
 * If `contextSummary` is provided it is injected first so the model knows
 * what happened before the visible window.
 */
export function buildContextMessages(
  history: HistoryMessage[],
  contextSummary?: string | null,
): RoleMessage[] {
  const window = history.slice(-CONTEXT_WINDOW_SIZE);

  const out: RoleMessage[] = [];

  if (contextSummary) {
    out.push({
      role: "system",
      content: `Earlier in our conversation (before the messages shown below), here is a summary of what we discussed:\n\n${contextSummary}`,
    });
  }

  for (const m of window) {
    out.push({
      role: m.role === "assistant" ? "assistant" : "user",
      content: m.content,
    });
  }

  return out;
}

// ---------------------------------------------------------------------------
// Incremental summarisation helpers
// ---------------------------------------------------------------------------

/**
 * Current window start index: the first message index that falls *inside*
 * the live window.  Everything before this index is "old" and should be
 * represented by the summary.
 */
export function windowStartIndex(historyLength: number): number {
  return Math.max(0, historyLength - CONTEXT_WINDOW_SIZE);
}

/**
 * Returns true when new messages have slid out of the live window since the
 * last summarisation watermark, meaning an incremental summary refresh is due.
 *
 * @param historyLength      Current total number of messages.
 * @param lastSummarizedCount  How many messages were in the history when the
 *                             summary was last generated (null = never summarised).
 */
export function shouldRefreshSummary(
  historyLength: number,
  lastSummarizedCount: number | null | undefined,
): boolean {
  const currentWindowStart = windowStartIndex(historyLength);
  if (currentWindowStart === 0) return false; // history still fits in the window
  const watermark = lastSummarizedCount ?? 0;
  return currentWindowStart > watermark;
}

/**
 * Returns the incremental slice of messages that have slid past the window
 * boundary since the last summarisation watermark.
 *
 * The slice starts at the **front** of the unsummarised range and is capped
 * at SUMMARY_BATCH_SIZE.  This guarantees:
 * - No messages are skipped — the watermark only advances as far as we
 *   actually processed.
 * - If the gap is larger than SUMMARY_BATCH_SIZE (e.g. first call on an
 *   already long conversation), `shouldRefreshSummary` will still return true
 *   on the next turn and processing continues from where it left off.
 *
 * @param history             Full history in chronological order.
 * @param lastSummarizedCount  Watermark from the last summary (null = 0).
 */
export function getIncrementalMessagesForSummarisation(
  history: HistoryMessage[],
  lastSummarizedCount: number | null | undefined,
): HistoryMessage[] {
  const start = lastSummarizedCount ?? 0;
  const end = windowStartIndex(history.length);
  if (end <= start) return [];
  // Process from the FRONT of the unsummarised range, bounded by SUMMARY_BATCH_SIZE.
  return history.slice(start, Math.min(end, start + SUMMARY_BATCH_SIZE));
}

/**
 * The new watermark to persist after a successful incremental summary refresh.
 * Advances exactly as far as the processed delta — never further.
 *
 * @param lastSummarizedCount  The watermark before this refresh.
 * @param deltaLength          The number of messages that were actually summarised.
 */
export function nextSummarizedCount(
  lastSummarizedCount: number | null | undefined,
  deltaLength: number,
): number {
  return (lastSummarizedCount ?? 0) + deltaLength;
}
