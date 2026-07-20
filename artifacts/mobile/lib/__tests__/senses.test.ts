import type { Percept } from "@workspace/api-client-react";

import {
  BATTERY_LOW_LEVEL,
  MAX_OUTGOING_PERCEPTS,
  SHAKE_COOLDOWN_MS,
  SHAKE_THRESHOLD_G,
  batteryLowPercept,
  chargingPercept,
  collectOutgoingPercepts,
  daypartBucket,
  daypartPercept,
  detectShake,
  pushPercept,
  shakeMagnitude,
} from "../senses";

const NOW = 1_800_000_000_000;

function percept(kind: Percept["kind"], at = NOW): Percept {
  return { kind, intensity: 0.5, at };
}

describe("daypartBucket", () => {
  it("maps every hour onto the buckets the self understands", () => {
    expect(daypartBucket(0)).toBe("late_night");
    expect(daypartBucket(4)).toBe("late_night");
    expect(daypartBucket(5)).toBe("early_morning");
    expect(daypartBucket(7)).toBe("early_morning");
    expect(daypartBucket(8)).toBe("morning");
    expect(daypartBucket(10)).toBe("morning");
    expect(daypartBucket(11)).toBe("midday");
    expect(daypartBucket(13)).toBe("midday");
    expect(daypartBucket(14)).toBe("afternoon");
    expect(daypartBucket(16)).toBe("afternoon");
    expect(daypartBucket(17)).toBe("evening");
    expect(daypartBucket(20)).toBe("evening");
    expect(daypartBucket(21)).toBe("night");
    expect(daypartBucket(23)).toBe("night");
  });

  it("builds a daypart percept whose detail matches the local hour", () => {
    const p = daypartPercept(NOW);
    expect(p.kind).toBe("daypart");
    expect(p.at).toBe(NOW);
    expect(p.detail).toBe(daypartBucket(new Date(NOW).getHours()));
    expect(p.intensity).toBeGreaterThan(0);
    expect(p.intensity).toBeLessThanOrEqual(1);
  });
});

describe("detectShake", () => {
  it("ignores ordinary movement below the threshold", () => {
    expect(detectShake(1.0, null, NOW)).toBeNull();
    expect(detectShake(SHAKE_THRESHOLD_G - 0.01, null, NOW)).toBeNull();
  });

  it("emits a shake percept above the threshold", () => {
    const p = detectShake(SHAKE_THRESHOLD_G + 0.5, null, NOW);
    expect(p).not.toBeNull();
    expect(p?.kind).toBe("shake");
    expect(p?.at).toBe(NOW);
  });

  it("scales intensity with vigour but never past 1", () => {
    const gentle = detectShake(SHAKE_THRESHOLD_G, null, NOW);
    const violent = detectShake(SHAKE_THRESHOLD_G + 10, null, NOW);
    expect(gentle && violent).toBeTruthy();
    expect(violent!.intensity).toBeGreaterThan(gentle!.intensity);
    expect(violent!.intensity).toBeLessThanOrEqual(1);
  });

  it("suppresses repeat shakes inside the cooldown window", () => {
    const first = detectShake(3, null, NOW)!;
    expect(
      detectShake(3, first.at, NOW + SHAKE_COOLDOWN_MS - 1),
    ).toBeNull();
    expect(
      detectShake(3, first.at, NOW + SHAKE_COOLDOWN_MS),
    ).not.toBeNull();
  });

  it("computes magnitude from a 3-axis sample", () => {
    expect(shakeMagnitude({ x: 3, y: 4, z: 0 })).toBeCloseTo(5);
    expect(shakeMagnitude({ x: 0, y: 0, z: -1 })).toBeCloseTo(1);
  });
});

describe("chargingPercept", () => {
  it("fires only on the unplugged → plugged transition", () => {
    expect(chargingPercept(false, true, NOW)?.kind).toBe("charging");
  });

  it("stays quiet when the state is unknown, unchanged, or unplugging", () => {
    expect(chargingPercept(null, true, NOW)).toBeNull();
    expect(chargingPercept(true, true, NOW)).toBeNull();
    expect(chargingPercept(true, false, NOW)).toBeNull();
    expect(chargingPercept(false, false, NOW)).toBeNull();
  });
});

describe("batteryLowPercept", () => {
  it("fires when low, unplugged, and not yet reported", () => {
    const p = batteryLowPercept(BATTERY_LOW_LEVEL - 0.05, false, false, NOW);
    expect(p?.kind).toBe("battery_low");
  });

  it("stays quiet while charging, already reported, or healthy", () => {
    expect(batteryLowPercept(0.1, true, false, NOW)).toBeNull();
    expect(batteryLowPercept(0.1, false, true, NOW)).toBeNull();
    expect(batteryLowPercept(BATTERY_LOW_LEVEL, false, false, NOW)).toBeNull();
    expect(batteryLowPercept(0.9, false, false, NOW)).toBeNull();
  });

  it("ignores the unknown level (-1) some platforms report", () => {
    expect(batteryLowPercept(-1, false, false, NOW)).toBeNull();
  });
});

describe("pushPercept", () => {
  it("keeps only the freshest percept per kind", () => {
    const older = percept("shake", NOW - 1000);
    const newer = percept("shake", NOW);
    const buffer = pushPercept(pushPercept([], older), newer);
    expect(buffer).toHaveLength(1);
    expect(buffer[0].at).toBe(NOW);
  });

  it("never grows past the outgoing cap", () => {
    let buffer: Percept[] = [];
    const kinds: Percept["kind"][] = [
      "shake",
      "charging",
      "battery_low",
      "daypart",
    ];
    for (let i = 0; i < 20; i++) {
      buffer = pushPercept(buffer, {
        ...percept(kinds[i % kinds.length]),
        at: NOW + i,
      });
    }
    expect(buffer.length).toBeLessThanOrEqual(MAX_OUTGOING_PERCEPTS);
  });
});

describe("collectOutgoingPercepts", () => {
  it("returns nothing when senses are disabled — even with a full buffer", () => {
    const result = collectOutgoingPercepts({
      enabled: false,
      isWeb: false,
      buffer: [percept("shake"), percept("charging")],
      now: NOW,
    });
    expect(result).toEqual([]);
  });

  it("degrades to daypart-only on web, dropping sensor percepts", () => {
    const result = collectOutgoingPercepts({
      enabled: true,
      isWeb: true,
      buffer: [percept("shake"), percept("battery_low")],
      now: NOW,
    });
    expect(result).toHaveLength(1);
    expect(result[0].kind).toBe("daypart");
  });

  it("sends buffered sensor percepts plus the ambient daypart on native", () => {
    const result = collectOutgoingPercepts({
      enabled: true,
      isWeb: false,
      buffer: [percept("shake"), percept("charging")],
      now: NOW,
    });
    expect(result.map((p) => p.kind)).toEqual([
      "shake",
      "charging",
      "daypart",
    ]);
  });

  it("caps the outgoing list at the server's limit", () => {
    const crowded: Percept[] = Array.from({ length: 12 }, (_, i) => ({
      ...percept("shake"),
      at: NOW + i,
    }));
    const result = collectOutgoingPercepts({
      enabled: true,
      isWeb: false,
      buffer: crowded,
      now: NOW,
    });
    expect(result.length).toBeLessThanOrEqual(MAX_OUTGOING_PERCEPTS);
    expect(result[result.length - 1].kind).toBe("daypart");
  });
});
