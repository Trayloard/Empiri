/**
 * Integration tests for the rolling context-window summarisation path.
 *
 * These tests drive the real POST /conversations/:id/messages route against
 * the real test DB.  OpenAI is mocked to return deterministic responses;
 * background self-evolution and reflection are silenced so their extra AI
 * calls do not interfere with the ordered mock sequence.
 *
 * Covered:
 *  1. shouldRefreshSummary fires when a conversation grows past CONTEXT_WINDOW_SIZE
 *  2. contextSummary and contextSummaryMessageCount are persisted in the DB
 *  3. The main chat completion call receives the summary injected as a system message
 */

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import request from "supertest";
import crypto from "crypto";
import { db, conversations, messages, sessionsTable, usersTable, companionSelves } from "@workspace/db";
import { eq } from "drizzle-orm";

// ---------------------------------------------------------------------------
// OpenAI mock — hoisted so it is in place before the app module resolves.
// The route makes two ordered calls when a summary refresh fires:
//   call 1 → summarisation call  → returns the known summary text
//   call 2 → main chat reply     → returns a simple assistant message
// ---------------------------------------------------------------------------
const openaiCreateMock = vi.hoisted(() => vi.fn());

vi.mock("@workspace/integrations-openai-ai-server", () => ({
  openai: { chat: { completions: { create: openaiCreateMock } } },
}));

// Silence background self-evolution and reflection so they never trigger a
// third (or fourth) openai call that would consume the ordered mock slots.
vi.mock("../../lib/messageSignal", () => ({
  enqueueConversationTask: vi.fn(),
  queueSelfEvolution: vi.fn(),
}));
vi.mock("../../lib/reflection", () => ({
  maybeReflect: vi.fn(),
  primeReflection: vi.fn(),
  takeCachedReflection: vi.fn(),
}));

// Import the app AFTER all vi.mock() calls are hoisted.
import app from "../../app";
import { CONTEXT_WINDOW_SIZE } from "../../lib/contextWindow";

// ---------------------------------------------------------------------------
// DB helpers (same pattern as auth-ownership.test.ts)
// ---------------------------------------------------------------------------

function makeId(): string {
  return `test-summ-${crypto.randomBytes(8).toString("hex")}`;
}

async function createTestUser(id: string): Promise<void> {
  await db
    .insert(usersTable)
    .values({ id, email: `${id}@test.local`, firstName: "Test", lastName: "User" })
    .onConflictDoNothing();
}

async function createTestSession(userId: string): Promise<string> {
  const sid = crypto.randomBytes(32).toString("hex");
  await db.insert(sessionsTable).values({
    sid,
    sess: {
      user: {
        id: userId,
        email: `${userId}@test.local`,
        firstName: "Test",
        lastName: "User",
        profileImageUrl: null,
      },
      access_token: "test-access-token",
    } as unknown as Record<string, unknown>,
    expire: new Date(Date.now() + 60 * 60 * 1000),
  });
  return sid;
}

async function createTestConversation(ownerId: string): Promise<number> {
  const [conv] = await db
    .insert(conversations)
    .values({ title: "Summarisation test", ownerId })
    .returning();
  return conv.id;
}

/** Bulk-insert `count` alternating user/assistant messages into a conversation. */
async function seedMessages(conversationId: number, count: number): Promise<void> {
  const rows = Array.from({ length: count }, (_, i) => ({
    conversationId,
    role: (i % 2 === 0 ? "user" : "assistant") as "user" | "assistant",
    content: `Seeded message ${i + 1}`,
  }));
  // Insert in small batches to stay under DB parameter limits.
  const BATCH = 50;
  for (let i = 0; i < rows.length; i += BATCH) {
    await db.insert(messages).values(rows.slice(i, i + BATCH));
  }
}

// ---------------------------------------------------------------------------
// Cleanup tracking
// ---------------------------------------------------------------------------

const createdUsers: string[] = [];
const createdSessions: string[] = [];
const createdConversations: number[] = [];

afterAll(async () => {
  // Messages and companion_selves are deleted implicitly by cascade when the
  // conversation row is removed (or we clean them explicitly below).
  for (const convId of createdConversations) {
    await db.delete(companionSelves).where(eq(companionSelves.conversationId, convId));
    await db.delete(messages).where(eq(messages.conversationId, convId));
    await db.delete(conversations).where(eq(conversations.id, convId));
  }
  for (const sid of createdSessions) {
    await db.delete(sessionsTable).where(eq(sessionsTable.sid, sid));
  }
  for (const uid of createdUsers) {
    await db.delete(usersTable).where(eq(usersTable.id, uid));
  }
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

const KNOWN_SUMMARY = "The user and Empiri discussed a wide variety of topics over many turns.";
const ASSISTANT_REPLY = "That is a great point!";

describe("POST /conversations/:id/messages — context-window summarisation", () => {
  let userId: string;
  let sessionToken: string;
  let convId: number;

  beforeAll(async () => {
    userId = makeId();
    await createTestUser(userId);
    createdUsers.push(userId);

    sessionToken = await createTestSession(userId);
    createdSessions.push(sessionToken);

    convId = await createTestConversation(userId);
    createdConversations.push(convId);

    // Pre-seed exactly CONTEXT_WINDOW_SIZE messages so that the NEXT inserted
    // message (the test's user message) pushes history.length to
    // CONTEXT_WINDOW_SIZE + 1, which triggers shouldRefreshSummary.
    await seedMessages(convId, CONTEXT_WINDOW_SIZE);
  });

  it("persists contextSummary and contextSummaryMessageCount in the DB after crossing the window boundary", async () => {
    // Call 1 (summarisation): return the known summary.
    // Call 2 (main chat): return the assistant reply.
    openaiCreateMock
      .mockResolvedValueOnce({
        choices: [{ message: { content: KNOWN_SUMMARY } }],
      })
      .mockResolvedValueOnce({
        choices: [{ message: { content: ASSISTANT_REPLY } }],
      });

    const res = await request(app)
      .post(`/api/conversations/${convId}/messages`)
      .set("Authorization", `Bearer ${sessionToken}`)
      .send({ content: "Hello, tell me something interesting." });

    expect(res.status).toBe(200);

    // Re-fetch the conversation row to verify the DB was updated.
    const [conv] = await db
      .select()
      .from(conversations)
      .where(eq(conversations.id, convId));

    expect(conv.contextSummary).toBe(KNOWN_SUMMARY);
    // watermark advances by delta.length; delta = messages[0..windowStart(41)) = 1 message
    expect(conv.contextSummaryMessageCount).toBeGreaterThan(0);
  });

  it("injects the persisted summary as a system message in the main chat completion call", async () => {
    // Fetch current state — the summary was written by the previous test.
    const [convBefore] = await db
      .select()
      .from(conversations)
      .where(eq(conversations.id, convId));
    const existingSummary = convBefore.contextSummary!;
    expect(existingSummary).toBeTruthy();

    // Count how many messages exist now, compute the current window start, and
    // advance the watermark to that point so shouldRefreshSummary returns false
    // for this turn.  This isolates the assertion to the single main-chat call.
    const currentMessages = await db
      .select()
      .from(messages)
      .where(eq(messages.conversationId, convId));
    // After the next user message is inserted, history.length = N + 1.
    const futureHistoryLen = currentMessages.length + 1;
    const futureWindowStart = Math.max(0, futureHistoryLen - CONTEXT_WINDOW_SIZE);
    await db
      .update(conversations)
      .set({ contextSummaryMessageCount: futureWindowStart })
      .where(eq(conversations.id, convId));

    openaiCreateMock.mockReset();
    openaiCreateMock.mockResolvedValue({
      choices: [{ message: { content: "Interesting thoughts!" } }],
    });

    const res = await request(app)
      .post(`/api/conversations/${convId}/messages`)
      .set("Authorization", `Bearer ${sessionToken}`)
      .send({ content: "Another question." });

    expect(res.status).toBe(200);

    // With summarisation suppressed there is exactly one openai call: the main
    // chat completion.  Assert that it received the existing summary injected
    // as a system message in the messages array.
    expect(openaiCreateMock).toHaveBeenCalledOnce();
    const callArgs = openaiCreateMock.mock.calls[0][0] as {
      messages: { role: string; content: string }[];
    };
    const systemMessages = callArgs.messages.filter((m) => m.role === "system");
    const summaryInjected = systemMessages.some((m) => m.content.includes(existingSummary));
    expect(summaryInjected).toBe(true);

    // Negative assertion: messages that slid out of the context window must
    // NOT appear verbatim in the exchange messages sent to the LLM.  The
    // first seeded message ("Seeded message 1") is old enough to be outside
    // the CONTEXT_WINDOW_SIZE tail, so it should be represented only by the
    // summary — not as a raw exchange message.
    const exchangeMessages = callArgs.messages.filter((m) => m.role !== "system");
    const oldMessageLeaked = exchangeMessages.some((m) => m.content === "Seeded message 1");
    expect(oldMessageLeaked).toBe(false);

    // The total exchange messages must not exceed the window size.
    expect(exchangeMessages.length).toBeLessThanOrEqual(CONTEXT_WINDOW_SIZE);
  });
});
