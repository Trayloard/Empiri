import { describe, expect, it } from "vitest";

import {
  composePersona,
  createSelf,
  NEURO_PARAMS,
  perceive,
  perceptDriveNudges,
  project,
  sanitizePercepts,
  summarizeSelf,
  SENSES_BLOCK_ID,
  type InnerSelf,
  type Percept,
  type SensesData,
} from "../index";

const T0 = 1_700_000_000_000; // fixed epoch ms for deterministic time
const MINUTE = 60_000;
const HOUR = 3_600_000;

function sensesData(self: InnerSelf): SensesData {
  return self.blocks[SENSES_BLOCK_ID]!.data as SensesData;
}

function driveLevel(self: InnerSelf, key: string, now: number): number {
  const drive = summarizeSelf(self, NEURO_PARAMS, now).drives.find(
    (d) => d.key === key,
  );
  if (!drive) throw new Error(`missing drive ${key}`);
  return drive.level;
}

function shake(at: number, intensity = 0.8): Percept {
  return { kind: "shake", intensity, at };
}

describe("sanitizePercepts", () => {
  it("returns [] for non-arrays and drops malformed entries without discarding the rest", () => {
    expect(sanitizePercepts(undefined, T0, NEURO_PARAMS)).toEqual([]);
    expect(sanitizePercepts("nope", T0, NEURO_PARAMS)).toEqual([]);

    const cleaned = sanitizePercepts(
      [
        null,
        42,
        { kind: "microphone", intensity: 1, at: T0 }, // unknown kind
        { kind: "shake", intensity: "high", at: T0 }, // bad intensity
        { kind: "shake", intensity: 0.5, at: Number.NaN }, // bad timestamp
        { kind: "charging", intensity: 0.6, at: T0 - MINUTE },
      ],
      T0,
      NEURO_PARAMS,
    );
    expect(cleaned).toEqual([
      { kind: "charging", intensity: 0.6, at: T0 - MINUTE },
    ]);
  });

  it("clamps intensity to 0..1 and future timestamps to now (clock skew)", () => {
    const [p] = sanitizePercepts(
      [{ kind: "shake", intensity: 7, at: T0 + 5 * MINUTE }],
      T0,
      NEURO_PARAMS,
    );
    expect(p).toEqual({ kind: "shake", intensity: 1, at: T0 });
  });

  it("rejects stale percepts older than the staleness bound", () => {
    const staleAt = T0 - (NEURO_PARAMS.senses.maxStaleHours + 1) * HOUR;
    expect(
      sanitizePercepts([shake(staleAt)], T0, NEURO_PARAMS),
    ).toEqual([]);
  });

  it("keeps only the newest percept per kind (a burst is one moment)", () => {
    const cleaned = sanitizePercepts(
      [shake(T0 - 3 * MINUTE, 0.9), shake(T0 - MINUTE, 0.5), shake(T0 - 2 * MINUTE, 0.7)],
      T0,
      NEURO_PARAMS,
    );
    expect(cleaned).toHaveLength(1);
    expect(cleaned[0]).toEqual({ kind: "shake", intensity: 0.5, at: T0 - MINUTE });
  });

  it("trims and bounds the detail string, dropping empty ones", () => {
    const cleaned = sanitizePercepts(
      [
        { kind: "daypart", intensity: 0.5, at: T0, detail: `  ${"x".repeat(64)}  ` },
        { kind: "charging", intensity: 0.5, at: T0, detail: "   " },
      ],
      T0,
      NEURO_PARAMS,
    );
    const daypart = cleaned.find((p) => p.kind === "daypart")!;
    const charging = cleaned.find((p) => p.kind === "charging")!;
    expect(daypart.detail).toHaveLength(32);
    expect(charging.detail).toBeUndefined();
  });
});

describe("perceptDriveNudges", () => {
  it("produces small, capped nudges per kind", () => {
    const nudges = perceptDriveNudges(
      [
        shake(T0, 1),
        { kind: "charging", intensity: 1, at: T0 },
        { kind: "battery_low", intensity: 1, at: T0 },
        { kind: "daypart", intensity: 1, at: T0 },
      ],
      NEURO_PARAMS,
    );
    expect(nudges.novelty).toBeGreaterThan(0);
    expect(nudges.connection).toBeGreaterThan(0);
    expect(nudges.curiosity).toBeGreaterThan(0);
    expect(nudges.expression).toBeGreaterThan(0);
    for (const value of Object.values(nudges)) {
      expect(value).toBeLessThanOrEqual(0.3);
    }
  });
});

describe("perceive", () => {
  it("stores fresh percepts in the senses block without counting an interaction", () => {
    const self = createSelf(NEURO_PARAMS, undefined, T0);
    const felt = perceive(self, [shake(T0)], NEURO_PARAMS, T0);

    expect(felt.interactions).toBe(self.interactions);
    const data = sensesData(felt);
    expect(data.recent).toHaveLength(1);
    expect(data.recent[0]!.kind).toBe("shake");
    expect(data.lastOfferedAt.shake).toBe(T0);
  });

  it("with no valid percepts is exactly a time projection", () => {
    const self = createSelf(NEURO_PARAMS, undefined, T0);
    const now = T0 + 2 * HOUR;
    expect(perceive(self, [], NEURO_PARAMS, now)).toEqual(
      project(self, NEURO_PARAMS, now),
    );
    expect(perceive(self, "garbage", NEURO_PARAMS, now)).toEqual(
      project(self, NEURO_PARAMS, now),
    );
  });

  it("nudges the matching drive subtly (a shake lifts novelty, gently)", () => {
    const self = createSelf(NEURO_PARAMS, { drives: { novelty: 50 } }, T0);
    const baseline = driveLevel(project(self, NEURO_PARAMS, T0), "novelty", T0);
    const felt = perceive(self, [shake(T0, 1)], NEURO_PARAMS, T0);
    const lifted = driveLevel(felt, "novelty", T0);

    expect(lifted).toBeGreaterThan(baseline);
    expect(lifted - baseline).toBeLessThan(8); // subtle, never a mood swing
  });
});

describe("senses persona surfacing", () => {
  it("mentions a fresh, salient percept at most once and asks for naturalness", () => {
    const self = createSelf(NEURO_PARAMS, undefined, T0);
    const felt = perceive(self, [shake(T0, 0.9)], NEURO_PARAMS, T0);
    const persona = composePersona(felt, NEURO_PARAMS, T0);

    expect(persona).toContain("quiet sense from the device");
    expect(persona).toContain("shaken");
    expect(persona).toContain("only if it fits naturally");
  });

  it("stays silent without percepts and below the salience threshold", () => {
    const self = createSelf(NEURO_PARAMS, undefined, T0);
    expect(composePersona(self, NEURO_PARAMS, T0)).not.toContain(
      "quiet sense from the device",
    );

    const faint = perceive(self, [shake(T0, 0.2)], NEURO_PARAMS, T0);
    expect(composePersona(faint, NEURO_PARAMS, T0)).not.toContain(
      "quiet sense from the device",
    );
  });

  it("prunes stale percepts so an old shake is never mentioned later", () => {
    const self = createSelf(NEURO_PARAMS, undefined, T0);
    const felt = perceive(self, [shake(T0, 0.9)], NEURO_PARAMS, T0);

    const later = T0 + (NEURO_PARAMS.senses.freshWindowMinutes + 1) * MINUTE;
    expect(composePersona(felt, NEURO_PARAMS, later)).not.toContain(
      "quiet sense from the device",
    );
    expect(sensesData(project(felt, NEURO_PARAMS, later)).recent).toEqual([]);
  });

  it("voices the daypart through its detail bucket", () => {
    const self = createSelf(NEURO_PARAMS, undefined, T0);
    const felt = perceive(
      self,
      [{ kind: "daypart", intensity: 0.8, at: T0, detail: "late_night" }],
      NEURO_PARAMS,
      T0,
    );
    expect(composePersona(felt, NEURO_PARAMS, T0)).toContain("late at night");
  });
});

describe("senses throttling", () => {
  it("dampens a repeat of the same kind inside the throttle window", () => {
    const self = createSelf(NEURO_PARAMS, undefined, T0);
    const first = perceive(self, [shake(T0, 0.9)], NEURO_PARAMS, T0);

    const secondAt = T0 + 5 * MINUTE;
    const second = perceive(first, [shake(secondAt, 0.9)], NEURO_PARAMS, secondAt);
    const data = sensesData(second);

    // The repeat is folded (still felt) but below the surface threshold, and
    // the offer stamp is NOT refreshed — the throttle window doesn't extend.
    const repeat = data.recent.find((p) => p.at === secondAt)!;
    expect(repeat.intensity).toBe(NEURO_PARAMS.senses.dampenedIntensity);
    expect(data.lastOfferedAt.shake).toBe(T0);
  });

  it("lets the same kind surface again once the throttle window has passed", () => {
    const self = createSelf(NEURO_PARAMS, undefined, T0);
    const first = perceive(self, [shake(T0, 0.9)], NEURO_PARAMS, T0);

    const throttleMs = NEURO_PARAMS.senses.voiceThrottleMinutes.shake! * MINUTE;
    const laterAt = T0 + throttleMs + MINUTE;
    const later = perceive(first, [shake(laterAt, 0.9)], NEURO_PARAMS, laterAt);
    const data = sensesData(later);

    const fresh = data.recent.find((p) => p.at === laterAt)!;
    expect(fresh.intensity).toBe(0.9);
    expect(data.lastOfferedAt.shake).toBe(laterAt);
    expect(composePersona(later, NEURO_PARAMS, laterAt)).toContain("shaken");
  });

  it("throttles per kind — a different sense may still surface", () => {
    const self = createSelf(NEURO_PARAMS, undefined, T0);
    const shaken = perceive(self, [shake(T0, 0.9)], NEURO_PARAMS, T0);

    const chargeAt = T0 + 5 * MINUTE;
    const charged = perceive(
      shaken,
      [{ kind: "charging", intensity: 0.7, at: chargeAt }],
      NEURO_PARAMS,
      chargeAt,
    );
    const data = sensesData(charged);
    const charging = data.recent.find((p) => p.kind === "charging")!;
    expect(charging.intensity).toBe(0.7);
    expect(data.lastOfferedAt.charging).toBe(chargeAt);
  });
});
