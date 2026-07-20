/**
 * Persistence-layer tests for maybeSnapshotSelf / getSelfHistory.
 *
 * The pure neurobrane engine is covered by @workspace/neurobrane's own suite.
 * These tests focus on the snapshot timeline contract:
 *   - first-ever sight of a conversation always captures a snapshot
 *   - subsequent turns are throttled: no snapshot until enough interactions
 *     or enough wall-clock time has passed (cadence, not every turn)
 *   - getSelfHistory round-trips snapshots oldest-first with intact state
 *   - the history cap keeps only the most recent N snapshots
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// Shared in-memory store — hoisted so both the mock factory and the tests
// can reference the same state before any imports are resolved.
// ---------------------------------------------------------------------------
interface SnapshotRow {
  conversationId: number;
  interactions: number;
  capturedAt: Date;
  summary: {
    drives: { key: string; level: number; striving: number }[];
    traits: { key: string; value: number }[];
    interests: { topic: string; affinity: number; display?: string }[];
  };
}

const mockState = vi.hoisted(() => {
  const rows: SnapshotRow[] = [];
  return {
    rows,
    reset() {
      rows.length = 0;
    },
  };
});

// ---------------------------------------------------------------------------
// Mock drizzle-orm helpers. `eq` returns the raw value so `.where()` receives
// the plain conversationId; `desc` is a marker (the mock always sorts
// newest-first, mirroring the only orderBy used by selfSnapshots.ts).
// ---------------------------------------------------------------------------
vi.mock("drizzle-orm", () => ({
  eq: (_col: unknown, val: unknown) => val,
  desc: (col: unknown) => col,
}));

// ---------------------------------------------------------------------------
// Mock @workspace/db mirroring the chain used by selfSnapshots.ts:
//   select(...).from().where(id).orderBy(desc(capturedAt)).limit(n)
//   insert().values(row)  — capturedAt defaults to "now" like the DB column
// ---------------------------------------------------------------------------
vi.mock("@workspace/db", () => {
  const db = {
    select: () => ({
      from: () => ({
        where: (id: unknown) => ({
          orderBy: () => ({
            limit: (n: number) => {
              const matching = mockState.rows
                .filter((r) => r.conversationId === (id as number))
                .sort((a, b) => b.capturedAt.getTime() - a.capturedAt.getTime())
                .slice(0, n);
              return Promise.resolve(matching);
            },
          }),
        }),
      }),
    }),

    insert: () => ({
      values: (vals: Omit<SnapshotRow, "capturedAt">) => {
        mockState.rows.push({ ...vals, capturedAt: new Date() });
        return Promise.resolve();
      },
    }),
  };

  const companionSelfSnapshots = {
    conversationId: "conversationId",
    interactions: "interactions",
    capturedAt: "capturedAt",
    summary: "summary",
  };

  return { db, companionSelfSnapshots };
});

// ---------------------------------------------------------------------------
// Imports — after mocks are declared (vitest hoists vi.mock() calls anyway)
// ---------------------------------------------------------------------------
import {
  createSelf,
  deriveMessageSignal,
  evolve,
  NEURO_PARAMS,
  summarizeSelf,
  type InnerSelf,
} from "@workspace/neurobrane";
import { getSelfHistory, maybeSnapshotSelf } from "../lib/selfSnapshots";

const T0 = 1_700_000_000_000;
const HOUR = 3_600_000;
const SIX_HOURS = 6 * HOUR;

let nextId = 1;
function freshId() {
  return nextId++;
}

/** A self evolved through `turns` interactions, one per minute from T0. */
function selfWithInteractions(turns: number): InnerSelf {
  let self = createSelf(NEURO_PARAMS, undefined, T0);
  for (let i = 0; i < turns; i++) {
    self = evolve(
      self,
      deriveMessageSignal("I love astronomy and exploring deep space"),
      NEURO_PARAMS,
      T0 + (i + 1) * 60_000,
    );
  }
  return self;
}

beforeEach(() => {
  mockState.reset();
  vi.useFakeTimers();
  vi.setSystemTime(T0);
  delete process.env.SELF_SNAPSHOT_MIN_INTERVAL_MS;
  delete process.env.SELF_SNAPSHOT_INTERACTION_DELTA;
  delete process.env.SELF_HISTORY_LIMIT;
});

afterEach(() => {
  vi.useRealTimers();
});

// ---------------------------------------------------------------------------
// Cadence: when snapshots are (and are not) written
// ---------------------------------------------------------------------------
describe("maybeSnapshotSelf cadence", () => {
  it("always captures the first snapshot for a conversation", async () => {
    const id = freshId();
    await maybeSnapshotSelf(id, selfWithInteractions(0));

    const mine = mockState.rows.filter((r) => r.conversationId === id);
    expect(mine).toHaveLength(1);
    expect(mine[0]!.interactions).toBe(0);
  });

  it("does not snapshot again on the very next turn (duplicate prevention)", async () => {
    const id = freshId();
    await maybeSnapshotSelf(id, selfWithInteractions(0));
    await maybeSnapshotSelf(id, selfWithInteractions(1));

    expect(mockState.rows.filter((r) => r.conversationId === id)).toHaveLength(1);
  });

  it("does not snapshot below both thresholds, even across several calls", async () => {
    const id = freshId();
    await maybeSnapshotSelf(id, selfWithInteractions(0));

    // 7 more interactions (delta threshold is 8) over < 6h — never due.
    for (let turns = 1; turns <= 7; turns++) {
      vi.setSystemTime(T0 + turns * 10 * 60_000); // 10 min apart
      await maybeSnapshotSelf(id, selfWithInteractions(turns));
    }

    expect(mockState.rows.filter((r) => r.conversationId === id)).toHaveLength(1);
  });

  it("snapshots once the interaction delta is reached, regardless of time", async () => {
    const id = freshId();
    await maybeSnapshotSelf(id, selfWithInteractions(0));

    vi.setSystemTime(T0 + 60_000); // only 1 minute later
    await maybeSnapshotSelf(id, selfWithInteractions(8)); // gained 8 = delta

    const mine = mockState.rows.filter((r) => r.conversationId === id);
    expect(mine).toHaveLength(2);
    expect(mine[1]!.interactions).toBe(8);
  });

  it("snapshots after the minimum interval elapses, even with no new interactions", async () => {
    const id = freshId();
    await maybeSnapshotSelf(id, selfWithInteractions(0));

    vi.setSystemTime(T0 + SIX_HOURS); // exactly the threshold — due
    await maybeSnapshotSelf(id, selfWithInteractions(0));

    expect(mockState.rows.filter((r) => r.conversationId === id)).toHaveLength(2);
  });

  it("throttles against the latest snapshot, not the first", async () => {
    const id = freshId();
    await maybeSnapshotSelf(id, selfWithInteractions(0));

    vi.setSystemTime(T0 + SIX_HOURS);
    await maybeSnapshotSelf(id, selfWithInteractions(0)); // second snapshot

    // 5h59m after the *second* snapshot — not due, even though 11h59m > 6h from the first.
    vi.setSystemTime(T0 + SIX_HOURS + SIX_HOURS - 60_000);
    await maybeSnapshotSelf(id, selfWithInteractions(0));

    expect(mockState.rows.filter((r) => r.conversationId === id)).toHaveLength(2);
  });

  it("conversations are throttled independently of each other", async () => {
    const a = freshId();
    const b = freshId();

    await maybeSnapshotSelf(a, selfWithInteractions(0));
    // b has never been seen — its first snapshot must not be blocked by a's.
    await maybeSnapshotSelf(b, selfWithInteractions(0));

    expect(mockState.rows.filter((r) => r.conversationId === a)).toHaveLength(1);
    expect(mockState.rows.filter((r) => r.conversationId === b)).toHaveLength(1);
  });

  it("honors env overrides for the interaction delta", async () => {
    process.env.SELF_SNAPSHOT_INTERACTION_DELTA = "2";
    const id = freshId();

    await maybeSnapshotSelf(id, selfWithInteractions(0));
    vi.setSystemTime(T0 + 60_000);
    await maybeSnapshotSelf(id, selfWithInteractions(1)); // gained 1 < 2 — not due
    await maybeSnapshotSelf(id, selfWithInteractions(2)); // gained 2 — due

    expect(mockState.rows.filter((r) => r.conversationId === id)).toHaveLength(2);
  });

  it("honors env overrides for the minimum interval", async () => {
    process.env.SELF_SNAPSHOT_MIN_INTERVAL_MS = String(60_000);
    const id = freshId();

    await maybeSnapshotSelf(id, selfWithInteractions(0));
    vi.setSystemTime(T0 + 59_000);
    await maybeSnapshotSelf(id, selfWithInteractions(0)); // 59s < 1min — not due
    vi.setSystemTime(T0 + 60_000);
    await maybeSnapshotSelf(id, selfWithInteractions(0)); // due

    expect(mockState.rows.filter((r) => r.conversationId === id)).toHaveLength(2);
  });
});

// ---------------------------------------------------------------------------
// Round-trip: getSelfHistory returns intact snapshots, oldest first
// ---------------------------------------------------------------------------
describe("round-trip: maybeSnapshotSelf → getSelfHistory", () => {
  it("returns snapshots oldest-first with intact drives, traits, and interests", async () => {
    const id = freshId();
    const first = selfWithInteractions(0);
    const second = selfWithInteractions(8);

    await maybeSnapshotSelf(id, first);
    vi.setSystemTime(T0 + SIX_HOURS);
    await maybeSnapshotSelf(id, second);

    const history = await getSelfHistory(id);
    expect(history).toHaveLength(2);

    // Oldest first.
    expect(history[0]!.capturedAt.getTime()).toBeLessThan(history[1]!.capturedAt.getTime());
    expect(history[0]!.interactions).toBe(0);
    expect(history[1]!.interactions).toBe(8);

    // The stored summary must match what summarizeSelf produced at write time.
    const expected = summarizeSelf(second);
    expect(history[1]!.drives).toEqual(expected.drives);
    expect(history[1]!.traits).toEqual(expected.traits);
    for (const interest of expected.interests) {
      const got = history[1]!.interests.find((i) => i.topic === interest.topic);
      expect(got).toBeDefined();
      expect(got!.affinity).toBeCloseTo(interest.affinity, 10);
    }
  });

  it("returns an empty timeline for a conversation with no snapshots", async () => {
    expect(await getSelfHistory(freshId())).toEqual([]);
  });

  it("only returns snapshots belonging to the requested conversation", async () => {
    const a = freshId();
    const b = freshId();
    await maybeSnapshotSelf(a, selfWithInteractions(0));
    await maybeSnapshotSelf(b, selfWithInteractions(8));

    const historyA = await getSelfHistory(a);
    expect(historyA).toHaveLength(1);
    expect(historyA[0]!.interactions).toBe(0);
  });

  it("falls back to the topic key when an old snapshot lacks a display casing", async () => {
    const id = freshId();
    // Simulate a legacy row written before display casing existed.
    mockState.rows.push({
      conversationId: id,
      interactions: 3,
      capturedAt: new Date(T0),
      summary: {
        drives: [],
        traits: [],
        interests: [{ topic: "astronomy", affinity: 0.5 }],
      },
    });

    const [point] = await getSelfHistory(id);
    expect(point!.interests[0]!.display).toBe("astronomy");
  });

  it("caps the timeline to the most recent N snapshots (oldest dropped)", async () => {
    process.env.SELF_SNAPSHOT_MIN_INTERVAL_MS = "0"; // every call is due
    const id = freshId();

    for (let i = 0; i < 5; i++) {
      vi.setSystemTime(T0 + i * 60_000);
      await maybeSnapshotSelf(id, selfWithInteractions(0));
    }

    process.env.SELF_HISTORY_LIMIT = "3";
    const history = await getSelfHistory(id);

    expect(history).toHaveLength(3);
    // The three *newest* snapshots, still oldest-first.
    expect(history.map((h) => h.capturedAt.getTime())).toEqual([
      T0 + 2 * 60_000,
      T0 + 3 * 60_000,
      T0 + 4 * 60_000,
    ]);
  });

  it("an explicit limit argument overrides the env default", async () => {
    process.env.SELF_SNAPSHOT_MIN_INTERVAL_MS = "0";
    const id = freshId();
    for (let i = 0; i < 4; i++) {
      vi.setSystemTime(T0 + i * 60_000);
      await maybeSnapshotSelf(id, selfWithInteractions(0));
    }

    const history = await getSelfHistory(id, 2);
    expect(history).toHaveLength(2);
    expect(history[1]!.capturedAt.getTime()).toBe(T0 + 3 * 60_000);
  });
});
