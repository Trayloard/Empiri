import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import crypto from "crypto";
import app from "../../app";
import { db, sessionsTable, usersTable, conversations } from "@workspace/db";
import { eq } from "drizzle-orm";

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

function makeUserId(): string {
  return `test-user-${crypto.randomBytes(8).toString("hex")}`;
}

async function createTestUser(id: string) {
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
    .values({ title: "Test Conversation", ownerId })
    .returning();
  return conv.id;
}

// Track created resources for cleanup
const createdSessions: string[] = [];
const createdUsers: string[] = [];
const createdConversations: number[] = [];

// ---------------------------------------------------------------------------
// Test data setup
// ---------------------------------------------------------------------------

let userAId: string;
let userBId: string;
let tokenA: string;
let tokenB: string;
let convAId: number;

beforeAll(async () => {
  userAId = makeUserId();
  userBId = makeUserId();

  await createTestUser(userAId);
  await createTestUser(userBId);
  createdUsers.push(userAId, userBId);

  tokenA = await createTestSession(userAId);
  tokenB = await createTestSession(userBId);
  createdSessions.push(tokenA, tokenB);

  convAId = await createTestConversation(userAId);
  createdConversations.push(convAId);
});

afterAll(async () => {
  for (const id of createdConversations) {
    await db.delete(conversations).where(eq(conversations.id, id));
  }
  for (const sid of createdSessions) {
    await db.delete(sessionsTable).where(eq(sessionsTable.sid, sid));
  }
  for (const id of createdUsers) {
    await db.delete(usersTable).where(eq(usersTable.id, id));
  }
});

// ---------------------------------------------------------------------------
// Unauthenticated access is rejected
// ---------------------------------------------------------------------------

describe("unauthenticated requests", () => {
  it("POST /conversations → 401 without auth", async () => {
    const res = await request(app)
      .post("/api/conversations")
      .send({ title: "Should fail" });
    expect(res.status).toBe(401);
  });

  it("GET /conversations → 401 without auth", async () => {
    const res = await request(app).get("/api/conversations");
    expect(res.status).toBe(401);
  });

  it("GET /conversations/:id → 401 without auth", async () => {
    const res = await request(app).get(`/api/conversations/${convAId}`);
    expect(res.status).toBe(401);
  });

  it("PATCH /conversations/:id → 401 without auth", async () => {
    const res = await request(app)
      .patch(`/api/conversations/${convAId}`)
      .send({ title: "Should fail" });
    expect(res.status).toBe(401);
  });

  it("GET /conversations/:id/messages → 401 without auth", async () => {
    const res = await request(app).get(`/api/conversations/${convAId}/messages`);
    expect(res.status).toBe(401);
  });

  it("POST /conversations/:id/messages → 401 without auth", async () => {
    const res = await request(app)
      .post(`/api/conversations/${convAId}/messages`)
      .send({ content: "hello" });
    expect(res.status).toBe(401);
  });

  it("POST /conversations/:id/checkin → 401 without auth", async () => {
    const res = await request(app)
      .post(`/api/conversations/${convAId}/checkin`)
      .send({ hoursAway: 1, mood: "happy" });
    expect(res.status).toBe(401);
  });

  it("GET /conversations/:id/self → 401 without auth", async () => {
    const res = await request(app).get(`/api/conversations/${convAId}/self`);
    expect(res.status).toBe(401);
  });

  it("GET /conversations/:id/self/history → 401 without auth", async () => {
    const res = await request(app).get(`/api/conversations/${convAId}/self/history`);
    expect(res.status).toBe(401);
  });

  it("GET /conversations/:id/memory → 401 without auth", async () => {
    const res = await request(app).get(`/api/conversations/${convAId}/memory`);
    expect(res.status).toBe(401);
  });

  it("PATCH /conversations/:id/memory → 401 without auth", async () => {
    const res = await request(app)
      .patch(`/api/conversations/${convAId}/memory`)
      .send({ summary: "Should fail" });
    expect(res.status).toBe(401);
  });

  it("DELETE /conversations/:id/memory → 401 without auth", async () => {
    const res = await request(app).delete(`/api/conversations/${convAId}/memory`);
    expect(res.status).toBe(401);
  });
});

// ---------------------------------------------------------------------------
// Cross-user access returns 404 (not a leak)
// ---------------------------------------------------------------------------

describe("cross-user ownership enforcement", () => {
  it("GET /conversations/:id → 404 for user B accessing user A's conversation", async () => {
    const res = await request(app)
      .get(`/api/conversations/${convAId}`)
      .set("Authorization", `Bearer ${tokenB}`);
    expect(res.status).toBe(404);
  });

  it("PATCH /conversations/:id → 404 for user B renaming user A's conversation", async () => {
    const res = await request(app)
      .patch(`/api/conversations/${convAId}`)
      .set("Authorization", `Bearer ${tokenB}`)
      .send({ title: "Hijacked" });
    expect(res.status).toBe(404);

    // Title must be unchanged
    const [row] = await db
      .select()
      .from(conversations)
      .where(eq(conversations.id, convAId));
    expect(row.title).not.toBe("Hijacked");
  });

  it("GET /conversations/:id/messages → 404 for user B accessing user A's conversation", async () => {
    const res = await request(app)
      .get(`/api/conversations/${convAId}/messages`)
      .set("Authorization", `Bearer ${tokenB}`);
    expect(res.status).toBe(404);
  });

  it("POST /conversations/:id/messages → 404 for user B accessing user A's conversation", async () => {
    const res = await request(app)
      .post(`/api/conversations/${convAId}/messages`)
      .set("Authorization", `Bearer ${tokenB}`)
      .send({ content: "should be blocked" });
    expect(res.status).toBe(404);
  });

  it("POST /conversations/:id/checkin → 404 for user B accessing user A's conversation", async () => {
    const res = await request(app)
      .post(`/api/conversations/${convAId}/checkin`)
      .set("Authorization", `Bearer ${tokenB}`)
      .send({ hoursAway: 2, mood: "happy" });
    expect(res.status).toBe(404);
  });

  it("GET /conversations/:id/self → 404 for user B accessing user A's conversation", async () => {
    const res = await request(app)
      .get(`/api/conversations/${convAId}/self`)
      .set("Authorization", `Bearer ${tokenB}`);
    expect(res.status).toBe(404);
  });

  it("GET /conversations/:id/self/history → 404 for user B accessing user A's conversation", async () => {
    const res = await request(app)
      .get(`/api/conversations/${convAId}/self/history`)
      .set("Authorization", `Bearer ${tokenB}`);
    expect(res.status).toBe(404);
  });

  it("GET /conversations/:id/memory → 404 for user B accessing user A's conversation", async () => {
    const res = await request(app)
      .get(`/api/conversations/${convAId}/memory`)
      .set("Authorization", `Bearer ${tokenB}`);
    expect(res.status).toBe(404);
  });

  it("PATCH /conversations/:id/memory → 404 for user B and leaves the memory untouched", async () => {
    await db
      .update(conversations)
      .set({ contextSummary: "Original memory", contextSummaryMessageCount: 4 })
      .where(eq(conversations.id, convAId));

    const res = await request(app)
      .patch(`/api/conversations/${convAId}/memory`)
      .set("Authorization", `Bearer ${tokenB}`)
      .send({ summary: "Hijacked memory" });
    expect(res.status).toBe(404);

    const [row] = await db
      .select()
      .from(conversations)
      .where(eq(conversations.id, convAId));
    expect(row.contextSummary).toBe("Original memory");
  });

  it("DELETE /conversations/:id/memory → 404 for user B and leaves the memory untouched", async () => {
    const res = await request(app)
      .delete(`/api/conversations/${convAId}/memory`)
      .set("Authorization", `Bearer ${tokenB}`);
    expect(res.status).toBe(404);

    const [row] = await db
      .select()
      .from(conversations)
      .where(eq(conversations.id, convAId));
    expect(row.contextSummary).toBe("Original memory");

    // Reset for later tests
    await db
      .update(conversations)
      .set({ contextSummary: null, contextSummaryMessageCount: null })
      .where(eq(conversations.id, convAId));
  });
});

// ---------------------------------------------------------------------------
// Owner can edit and clear the memory
// ---------------------------------------------------------------------------

describe("owner memory editing", () => {
  it("PATCH /conversations/:id/memory → 200 replaces the summary (trimmed) and persists", async () => {
    const res = await request(app)
      .patch(`/api/conversations/${convAId}/memory`)
      .set("Authorization", `Bearer ${tokenA}`)
      .send({ summary: "  The user loves hiking and has a dog named Rex.  " });
    expect(res.status).toBe(200);
    expect(res.body.summary).toBe("The user loves hiking and has a dog named Rex.");

    const check = await request(app)
      .get(`/api/conversations/${convAId}/memory`)
      .set("Authorization", `Bearer ${tokenA}`);
    expect(check.status).toBe(200);
    expect(check.body.summary).toBe("The user loves hiking and has a dog named Rex.");
  });

  it("PATCH /conversations/:id/memory → 400 for empty, whitespace-only, missing, or too-long summaries", async () => {
    for (const body of [
      { summary: "" },
      { summary: "   " },
      {},
      { summary: "x".repeat(2001) },
    ]) {
      const res = await request(app)
        .patch(`/api/conversations/${convAId}/memory`)
        .set("Authorization", `Bearer ${tokenA}`)
        .send(body);
      expect(res.status).toBe(400);
    }

    // Memory unchanged after all the rejected writes.
    const check = await request(app)
      .get(`/api/conversations/${convAId}/memory`)
      .set("Authorization", `Bearer ${tokenA}`);
    expect(check.body.summary).toBe("The user loves hiking and has a dog named Rex.");
  });

  it("DELETE /conversations/:id/memory → 200 clears the summary and resets the watermark", async () => {
    // Simulate an in-progress summariser watermark.
    await db
      .update(conversations)
      .set({ contextSummaryMessageCount: 12 })
      .where(eq(conversations.id, convAId));

    const res = await request(app)
      .delete(`/api/conversations/${convAId}/memory`)
      .set("Authorization", `Bearer ${tokenA}`);
    expect(res.status).toBe(200);
    expect(res.body.summary).toBeNull();

    const [row] = await db
      .select()
      .from(conversations)
      .where(eq(conversations.id, convAId));
    expect(row.contextSummary).toBeNull();
    expect(row.contextSummaryMessageCount).toBeNull();

    const check = await request(app)
      .get(`/api/conversations/${convAId}/memory`)
      .set("Authorization", `Bearer ${tokenA}`);
    expect(check.body.summary).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Owner can access their own conversation
// ---------------------------------------------------------------------------

describe("owner can access their own conversation", () => {
  it("GET /conversations/:id/messages → 200 for the owner", async () => {
    const res = await request(app)
      .get(`/api/conversations/${convAId}/messages`)
      .set("Authorization", `Bearer ${tokenA}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it("GET /conversations/:id/self → 200 for the owner", async () => {
    const res = await request(app)
      .get(`/api/conversations/${convAId}/self`)
      .set("Authorization", `Bearer ${tokenA}`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("drives");
  });

  it("GET /conversations/:id/self/history → 200 for the owner", async () => {
    const res = await request(app)
      .get(`/api/conversations/${convAId}/self/history`)
      .set("Authorization", `Bearer ${tokenA}`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("snapshots");
  });

  it("GET /conversations/:id/memory → 200 for the owner (null summary when none yet)", async () => {
    const res = await request(app)
      .get(`/api/conversations/${convAId}/memory`)
      .set("Authorization", `Bearer ${tokenA}`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("summary");
    expect(res.body.summary).toBeNull();
  });

  it("GET /conversations/:id → 200 with the conversation for the owner", async () => {
    const res = await request(app)
      .get(`/api/conversations/${convAId}`)
      .set("Authorization", `Bearer ${tokenA}`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("id", convAId);
    expect(res.body).toHaveProperty("title");
    expect(res.body).toHaveProperty("createdAt");
  });

  it("PATCH /conversations/:id → 200 renames for the owner and persists", async () => {
    const res = await request(app)
      .patch(`/api/conversations/${convAId}`)
      .set("Authorization", `Bearer ${tokenA}`)
      .send({ title: "  My Renamed Chat  " });
    expect(res.status).toBe(200);
    expect(res.body.title).toBe("My Renamed Chat");

    const check = await request(app)
      .get(`/api/conversations/${convAId}`)
      .set("Authorization", `Bearer ${tokenA}`);
    expect(check.body.title).toBe("My Renamed Chat");
  });

  it("PATCH /conversations/:id → 400 for an empty or whitespace-only title", async () => {
    const empty = await request(app)
      .patch(`/api/conversations/${convAId}`)
      .set("Authorization", `Bearer ${tokenA}`)
      .send({ title: "" });
    expect(empty.status).toBe(400);

    const blank = await request(app)
      .patch(`/api/conversations/${convAId}`)
      .set("Authorization", `Bearer ${tokenA}`)
      .send({ title: "   " });
    expect(blank.status).toBe(400);

    const missing = await request(app)
      .patch(`/api/conversations/${convAId}`)
      .set("Authorization", `Bearer ${tokenA}`)
      .send({});
    expect(missing.status).toBe(400);

    const tooLong = await request(app)
      .patch(`/api/conversations/${convAId}`)
      .set("Authorization", `Bearer ${tokenA}`)
      .send({ title: "x".repeat(81) });
    expect(tooLong.status).toBe(400);
  });

  it("GET /conversations → lists only the caller's own conversations", async () => {
    const resA = await request(app)
      .get("/api/conversations")
      .set("Authorization", `Bearer ${tokenA}`);
    expect(resA.status).toBe(200);
    expect(Array.isArray(resA.body)).toBe(true);
    const idsA = resA.body.map((c: { id: number }) => c.id);
    expect(idsA).toContain(convAId);
    for (const c of resA.body) {
      expect(c).toHaveProperty("id");
      expect(c).toHaveProperty("title");
      expect(c).toHaveProperty("createdAt");
    }

    // User B owns nothing yet — their list must be empty, not user A's.
    const resB = await request(app)
      .get("/api/conversations")
      .set("Authorization", `Bearer ${tokenB}`);
    expect(resB.status).toBe(200);
    expect(resB.body.map((c: { id: number }) => c.id)).not.toContain(convAId);
  });

  it("POST /conversations → 201 creates a conversation owned by the caller", async () => {
    const res = await request(app)
      .post("/api/conversations")
      .set("Authorization", `Bearer ${tokenA}`)
      .send({ title: "New Test Conversation" });
    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty("id");

    // Clean up
    createdConversations.push(res.body.id);

    // User B cannot see it
    const checkRes = await request(app)
      .get(`/api/conversations/${res.body.id}/messages`)
      .set("Authorization", `Bearer ${tokenB}`);
    expect(checkRes.status).toBe(404);
  });
});
