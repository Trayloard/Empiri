import type {
  CompanionSelf,
  CompanionSelfSnapshot,
} from "@workspace/api-client-react";

import {
  buildTimeline,
  firstSeenCuriosities,
  relativeWhen,
  sparklinePath,
  traitSeries,
} from "../growth";

const HOUR = 60 * 60 * 1000;
const NOW = new Date("2026-06-12T12:00:00.000Z").getTime();

function snap(
  hoursAgo: number,
  interactions: number,
  traits: Record<string, number>,
  interests: { topic: string; affinity: number; display?: string }[],
): CompanionSelfSnapshot {
  return {
    capturedAt: new Date(NOW - hoursAgo * HOUR).toISOString(),
    interactions,
    drives: [],
    traits: Object.entries(traits).map(([key, value]) => ({ key, value })),
    interests: interests.map((it) => ({ ...it, display: it.display ?? it.topic })),
  };
}

function live(
  interactions: number,
  traits: Record<string, number>,
  interests: { topic: string; affinity: number; display?: string }[],
): CompanionSelf {
  return {
    interactions,
    ageHours: 10,
    narrative: [],
    drives: [],
    traits: Object.entries(traits).map(([key, value]) => ({ key, value })),
    interests: interests.map((it) => ({ ...it, display: it.display ?? it.topic })),
  };
}

describe("buildTimeline", () => {
  it("sorts snapshots oldest→newest and appends the live now point", () => {
    const points = buildTimeline(
      [
        snap(2, 8, { warmth: 60 }, []),
        snap(6, 2, { warmth: 50 }, []),
      ],
      live(12, { warmth: 70 }, []),
      NOW,
    );
    expect(points).toHaveLength(3);
    expect(points.map((p) => p.interactions)).toEqual([2, 8, 12]);
    expect(points[0].isNow).toBe(false);
    expect(points[2].isNow).toBe(true);
    expect(points[2].at).toBe(NOW);
  });

  it("works with no snapshots (just the now point)", () => {
    const points = buildTimeline([], live(3, { calm: 40 }, []), NOW);
    expect(points).toHaveLength(1);
    expect(points[0].isNow).toBe(true);
  });

  it("omits the now point when there is no live self", () => {
    const points = buildTimeline([snap(1, 5, { calm: 40 }, [])], null, NOW);
    expect(points).toHaveLength(1);
    expect(points[0].isNow).toBe(false);
  });
});

describe("traitSeries", () => {
  it("extracts one value per point and defaults missing traits to 0", () => {
    const points = buildTimeline(
      [snap(2, 8, { warmth: 60 }, [])],
      live(12, { warmth: 70, calm: 30 }, []),
      NOW,
    );
    const series = traitSeries(points, ["warmth", "calm"]);
    expect(series.find((s) => s.key === "warmth")!.values).toEqual([60, 70]);
    // calm missing from the first snapshot → 0, present live → 30
    expect(series.find((s) => s.key === "calm")!.values).toEqual([0, 30]);
  });
});

describe("firstSeenCuriosities", () => {
  it("keeps the earliest appearance and the latest affinity, newest first", () => {
    const points = buildTimeline(
      [
        snap(6, 2, {}, [{ topic: "astronomy", affinity: 20 }]),
        snap(2, 8, {}, [
          { topic: "astronomy", affinity: 35 },
          { topic: "jazz", affinity: 25 },
        ]),
      ],
      live(12, {}, [
        { topic: "astronomy", affinity: 40 },
        { topic: "jazz", affinity: 30 },
        { topic: "deep sea", affinity: 15 },
      ]),
      NOW,
    );
    const curios = firstSeenCuriosities(points);
    // newest first-seen on top: deep sea (now) > jazz (2h) > astronomy (6h)
    expect(curios.map((c) => c.topic)).toEqual(["deep sea", "jazz", "astronomy"]);

    const astronomy = curios.find((c) => c.topic === "astronomy")!;
    expect(astronomy.at).toBe(NOW - 6 * HOUR); // earliest sighting
    expect(astronomy.affinity).toBe(40); // latest affinity
    expect(astronomy.isNow).toBe(false);

    const deepSea = curios.find((c) => c.topic === "deep sea")!;
    expect(deepSea.isNow).toBe(true);
  });

  it("returns an empty list when nothing has surfaced", () => {
    expect(firstSeenCuriosities([])).toEqual([]);
  });
});

describe("sparklinePath", () => {
  it("returns empty string for no values", () => {
    expect(sparklinePath([], 100, 40)).toBe("");
  });

  it("draws a flat line for a single value", () => {
    expect(sparklinePath([50], 100, 40)).toMatch(/^M 0 .+ L 100 /);
  });

  it("draws one move + (n-1) line segments for n values", () => {
    const d = sparklinePath([0, 50, 100], 100, 40);
    expect((d.match(/L /g) || []).length).toBe(2);
    expect(d.startsWith("M ")).toBe(true);
  });
});

describe("relativeWhen", () => {
  it("labels the live point as just now", () => {
    expect(relativeWhen(NOW - 5 * HOUR, true, NOW)).toBe("just now");
  });
  it("buckets hours, days and weeks", () => {
    expect(relativeWhen(NOW - 3 * HOUR, false, NOW)).toBe("3 hours ago");
    expect(relativeWhen(NOW - 25 * HOUR, false, NOW)).toBe("yesterday");
    expect(relativeWhen(NOW - 3 * 24 * HOUR, false, NOW)).toBe("3 days ago");
    expect(relativeWhen(NOW - 14 * 24 * HOUR, false, NOW)).toBe("2 weeks ago");
  });
});
