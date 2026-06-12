/**
 * Persistence-layer tests for loadOrCreateSelf / saveSelf.
 *
 * The pure neurobrane engine is covered by @workspace/neurobrane's own suite.
 * These tests focus exclusively on the DB round-trip contract:
 *   - what is saved comes back byte-for-byte identical (no surprise decay on reload)
 *   - composePersona never persists (no double-decay when compose → evolve → save)
 *   - first-contact load inserts exactly once even under a re-read (race-safe path)
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// Shared in-memory store — hoisted so both the mock factory and the tests
// can reference the same Map instance before any imports are resolved.
// ---------------------------------------------------------------------------
const mockState = vi.hoisted(() => {
  const store = new Map<number, unknown>();
  let insertCount = 0;
  return {
    store,
    get insertCount() {
      return insertCount;
    },
    bumpInsert() {
      insertCount++;
    },
    reset() {
      store.clear();
      insertCount = 0;
    },
  };
});

// ---------------------------------------------------------------------------
// Mock drizzle-orm's `eq` helper.
// eq(column, value) returns an opaque SQL expression in real drizzle; in our
// mock we just return the value directly so that `.where(eq(col, id))` passes
// the plain conversationId number into our mock's `.where()` handler.
// ---------------------------------------------------------------------------
vi.mock("drizzle-orm", () => ({
  eq: (_col: unknown, val: unknown) => val,
}));

// ---------------------------------------------------------------------------
// Mock @workspace/db.
// The db object mirrors the drizzle chain API used by companionSelf.ts:
//   select().from().where()          → returns stored rows
//   insert().values().onConflictDoNothing() → inserts if absent
//   update().set().where()           → upserts the stored state
// ---------------------------------------------------------------------------
vi.mock("@workspace/db", () => {
  let _pendingState: unknown;

  const db = {
    select: () => ({
      from: () => ({
        where: (id: unknown) => {
          const rows = mockState.store.has(id as number)
            ? [{ conversationId: id, state: mockState.store.get(id as number) }]
            : [];
          return Promise.resolve(rows);
        },
      }),
    }),

    insert: () => ({
      values: (vals: { conversationId: number; state: unknown }) => ({
        onConflictDoNothing: () => {
          // Race-safe: only set if no row exists yet (mirrors ON CONFLICT DO NOTHING)
          if (!mockState.store.has(vals.conversationId)) {
            mockState.store.set(vals.conversationId, vals.state);
            mockState.bumpInsert();
          }
          return Promise.resolve();
        },
      }),
    }),

    update: () => ({
      set: (vals: { state: unknown }) => {
        _pendingState = vals.state;
        return {
          where: (id: unknown) => {
            mockState.store.set(id as number, _pendingState);
            return Promise.resolve();
          },
        };
      },
    }),
  };

  const companionSelves = {
    conversationId: "conversationId",
    state: "state",
  };

  return { db, companionSelves };
});

// ---------------------------------------------------------------------------
// Imports — after mocks are declared (vitest hoists vi.mock() calls anyway)
// ---------------------------------------------------------------------------
import {
  composePersona,
  createSelf,
  deriveMessageSignal,
  evolve,
  NEURO_PARAMS,
  project,
  summarizeSelf,
  type InnerSelf,
} from "@workspace/neurobrane";
import { loadOrCreateSelf, saveSelf } from "../lib/companionSelf";

const T0 = 1_700_000_000_000;
const HOUR = 3_600_000;
let nextId = 1;
function freshId() {
  return nextId++;
}

beforeEach(() => {
  mockState.reset();
});

// ---------------------------------------------------------------------------
// Round-trip: what is saved comes back identical
// ---------------------------------------------------------------------------
describe("round-trip: saveSelf → loadOrCreateSelf", () => {
  it("returns a structurally identical inner self after a save", async () => {
    const id = freshId();
    const original = createSelf(NEURO_PARAMS, undefined, T0);

    // Seed the store via a first-contact load so a row exists, then overwrite
    // it with our known state via saveSelf.
    await loadOrCreateSelf(id);
    await saveSelf(id, original);

    const reloaded = await loadOrCreateSelf(id);

    // Scalar counts must be preserved exactly.
    expect(reloaded.interactions).toBe(original.interactions);
    expect(reloaded.createdAt).toBe(original.createdAt);
    expect(reloaded.schemaVersion).toBe(original.schemaVersion);

    // Every enabled block's data must survive the round-trip unchanged.
    for (const blockId of NEURO_PARAMS.enabledBlocks) {
      expect(reloaded.blocks[blockId]).toBeDefined();
      expect(JSON.stringify(reloaded.blocks[blockId]!.data)).toBe(
        JSON.stringify(original.blocks[blockId]!.data),
      );
    }
  });

  it("round-trips an evolved self (non-default drive levels) without alteration", async () => {
    const id = freshId();

    // Create and evolve the self several times so the drives/traits are non-trivial.
    let self = createSelf(NEURO_PARAMS, undefined, T0);
    let now = T0;
    for (let i = 0; i < 5; i++) {
      now += HOUR;
      self = evolve(self, deriveMessageSignal("I love astronomy and exploring deep space"), NEURO_PARAMS, now);
    }

    await loadOrCreateSelf(id); // creates a row
    await saveSelf(id, self);

    const reloaded = await loadOrCreateSelf(id);

    expect(reloaded.interactions).toBe(self.interactions);
    expect(reloaded.createdAt).toBe(self.createdAt);

    const summaryOriginal = summarizeSelf(self, NEURO_PARAMS, now);
    const summaryReloaded = summarizeSelf(reloaded, NEURO_PARAMS, now);

    // Drive levels must be identical — no phantom decay applied during reload.
    for (const drive of summaryOriginal.drives) {
      const reloadedDrive = summaryReloaded.drives.find((d) => d.key === drive.key);
      expect(reloadedDrive).toBeDefined();
      expect(reloadedDrive!.level).toBeCloseTo(drive.level, 10);
    }

    // Interest affinities must be identical.
    for (const interest of summaryOriginal.interests) {
      const reloadedInterest = summaryReloaded.interests.find((i) => i.topic === interest.topic);
      expect(reloadedInterest).toBeDefined();
      expect(reloadedInterest!.affinity).toBeCloseTo(interest.affinity, 10);
    }
  });

  it("hydrate preserves unknown block keys that are not in the enabled set", async () => {
    const id = freshId();
    const base = createSelf(NEURO_PARAMS, undefined, T0);

    // Inject a "future" block that no current enabled block knows about.
    const withFutureBlock: InnerSelf = {
      ...base,
      blocks: {
        ...base.blocks,
        "future-block-xyz": { version: 99, lastUpdatedAt: T0, data: { secret: 42 } },
      },
    };

    await loadOrCreateSelf(id);
    await saveSelf(id, withFutureBlock);

    const reloaded = await loadOrCreateSelf(id);

    // The future block must survive intact.
    expect((reloaded.blocks["future-block-xyz"] as { data: { secret: number } })?.data?.secret).toBe(42);
  });
});

// ---------------------------------------------------------------------------
// No-double-decay invariant
// ---------------------------------------------------------------------------
describe("no-double-decay: composePersona does not persist", () => {
  it("evolve+save at T+1h advances the self exactly once; reload matches that state", async () => {
    const id = freshId();

    // Simulate the route flow:
    //   1. load the self (creates it)
    //   2. composePersona (projects to now — read-only, must NOT save)
    //   3. evolve + save (the only write for this turn)
    //   4. reload — must equal the singly-evolved state, not a double-decayed one
    const self = await loadOrCreateSelf(id);
    const T1 = T0 + HOUR;

    // composePersona internally calls project() but never writes to the DB.
    const _prompt = composePersona(self, NEURO_PARAMS, T1);
    expect(typeof _prompt).toBe("string"); // just to use the value

    const evolved = evolve(self, deriveMessageSignal("Hello! How are you today?"), NEURO_PARAMS, T1);
    await saveSelf(id, evolved);

    const reloaded = await loadOrCreateSelf(id);

    // The reloaded self must equal the singly-evolved self, not be any further
    // decayed (which would happen if composePersona had persisted a projected self
    // and then evolve() re-decayed on top of that persisted projection).
    expect(reloaded.interactions).toBe(1);

    for (const blockId of NEURO_PARAMS.enabledBlocks) {
      expect(JSON.stringify(reloaded.blocks[blockId]!.data)).toBe(
        JSON.stringify(evolved.blocks[blockId]!.data),
      );
    }
  });

  it("project() (check-in decay) + save advances once; reload matches the projected state", async () => {
    const id = freshId();
    const self = await loadOrCreateSelf(id);
    const T1 = T0 + 24 * HOUR;

    // Simulate the check-in route: project() to persist time-decay, then save.
    const projected = project(self, NEURO_PARAMS, T1);
    await saveSelf(id, projected);

    const reloaded = await loadOrCreateSelf(id);

    // The reloaded self must equal the projected state exactly.
    expect(reloaded.interactions).toBe(projected.interactions);
    for (const blockId of NEURO_PARAMS.enabledBlocks) {
      const projData = JSON.stringify(projected.blocks[blockId]!.data);
      const reloadData = JSON.stringify(reloaded.blocks[blockId]!.data);
      expect(reloadData).toBe(projData);
    }
  });

  it("multiple compose calls before a single save still result in only one evolution", async () => {
    const id = freshId();
    const self = await loadOrCreateSelf(id);
    const T1 = T0 + HOUR;

    // Multiple compose calls (e.g. two concurrent requests reading the same self)
    composePersona(self, NEURO_PARAMS, T1);
    composePersona(self, NEURO_PARAMS, T1 + 30_000);
    composePersona(self, NEURO_PARAMS, T1 + 60_000);

    const evolved = evolve(self, deriveMessageSignal("What do you think about music?"), NEURO_PARAMS, T1);
    await saveSelf(id, evolved);

    const reloaded = await loadOrCreateSelf(id);

    // Still exactly one interaction — the three composes left no trace.
    expect(reloaded.interactions).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// First-contact: lazy creation, race-safe path
// ---------------------------------------------------------------------------
describe("first-contact: loadOrCreateSelf creates exactly once", () => {
  it("inserts a fresh self when no row exists", async () => {
    const id = freshId();
    expect(mockState.store.has(id)).toBe(false);
    expect(mockState.insertCount).toBe(0);

    const self = await loadOrCreateSelf(id);

    expect(mockState.store.has(id)).toBe(true);
    expect(mockState.insertCount).toBe(1);
    expect(self.interactions).toBe(0);
    expect(Object.keys(self.blocks).length).toBeGreaterThan(0);
  });

  it("returns the existing row without inserting again on a second call", async () => {
    const id = freshId();
    await loadOrCreateSelf(id); // first contact — inserts
    const insertAfterFirst = mockState.insertCount;

    await loadOrCreateSelf(id); // second call — must read, not re-insert
    expect(mockState.insertCount).toBe(insertAfterFirst);
  });

  it("race-safe: concurrent insert is swallowed; both callers converge on the same self", async () => {
    const id = freshId();

    // Simulate the race: two calls fire before either has received a result.
    // Our mock's onConflictDoNothing only inserts the first one; the second is
    // a no-op and both re-reads return the winner.
    const [selfA, selfB] = await Promise.all([loadOrCreateSelf(id), loadOrCreateSelf(id)]);

    // Exactly one insert, despite two concurrent calls.
    expect(mockState.insertCount).toBe(1);

    // Both callers converge on the same persisted state.
    expect(JSON.stringify(selfA.blocks)).toBe(JSON.stringify(selfB.blocks));
    expect(selfA.createdAt).toBe(selfB.createdAt);
  });

  it("the freshly created self has all enabled blocks initialized within bounds", async () => {
    const id = freshId();
    const self = await loadOrCreateSelf(id);
    const { min, max } = NEURO_PARAMS.bounds;
    const summary = summarizeSelf(self, NEURO_PARAMS, self.createdAt);

    expect(Object.keys(self.blocks).sort()).toEqual([...NEURO_PARAMS.enabledBlocks].sort());
    expect(summary.drives.every((d) => d.level >= min && d.level <= max)).toBe(true);
    expect(summary.traits.every((t) => t.value >= min && t.value <= max)).toBe(true);
  });
});
