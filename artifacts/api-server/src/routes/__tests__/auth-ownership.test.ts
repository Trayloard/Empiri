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
});

// ---------------------------------------------------------------------------
// Cross-user access returns 404 (not a leak)
// ---------------------------------------------------------------------------

describe("cross-user ownership enforcement", () => {
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
