import type { CompanionSelfSnapshot } from "@workspace/api-client-react";

import {
  describeSnapshot,
  dominantTraits,
  formatSnapshotDate,
  traitLabel,
} from "@/lib/evolution";

function snapshot(
  partial: Partial<CompanionSelfSnapshot> = {},
): CompanionSelfSnapshot {
  return {
    capturedAt: "2026-07-01T12:00:00.000Z",
    interactions: 10,
    drives: [],
    traits: [],
    interests: [],
    ...partial,
  };
}

describe("dominantTraits", () => {
  it("returns the strongest traits, sorted by value", () => {
    const result = dominantTraits(
      [
        { key: "warmth", value: 0.4 },
        { key: "curiosity", value: 0.9 },
        { key: "calm", value: 0.7 },
        { key: "openness", value: 0.1 },
      ],
      2,
    );
    expect(result.map((t) => t.key)).toEqual(["curiosity", "calm"]);
  });

  it("breaks ties by key for a stable order", () => {
    const result = dominantTraits([
      { key: "warmth", value: 0.5 },
      { key: "calm", value: 0.5 },
    ]);
    expect(result.map((t) => t.key)).toEqual(["calm", "warmth"]);
  });
});

describe("traitLabel", () => {
  it("uses the friendly adjective for known traits", () => {
    expect(traitLabel("warmth")).toBe("Warm");
    expect(traitLabel("calm")).toBe("Calm and grounded");
  });

  it("falls back to the raw key for unknown traits", () => {
    expect(traitLabel("stoicism")).toBe("Stoicism");
  });
});

describe("describeSnapshot", () => {
  it("mentions the two dominant traits", () => {
    const text = describeSnapshot(
      snapshot({
        traits: [
          { key: "warmth", value: 0.8 },
          { key: "curiosity", value: 0.9 },
          { key: "calm", value: 0.2 },
        ],
      }),
    );
    expect(text).toBe("Feeling especially curious and warm.");
  });

  it("adds the strongest interest when one exists", () => {
    const text = describeSnapshot(
      snapshot({
        traits: [{ key: "openness", value: 0.6 }],
        interests: [
          { topic: "astronomy", affinity: 0.7, display: "Astronomy" },
          { topic: "tea", affinity: 0.3, display: "Tea" },
        ],
      }),
    );
    expect(text).toBe("Feeling especially open-minded, drawn to Astronomy.");
  });

  it("falls back to the topic key when display is empty", () => {
    const text = describeSnapshot(
      snapshot({
        traits: [{ key: "warmth", value: 0.6 }],
        interests: [{ topic: "chess", affinity: 0.5, display: "" }],
      }),
    );
    expect(text).toContain("drawn to chess");
  });

  it("has a gentle fallback when there are no traits yet", () => {
    expect(describeSnapshot(snapshot())).toBe("Just beginning to take shape.");
  });
});

describe("formatSnapshotDate", () => {
  it("formats a valid ISO date", () => {
    expect(formatSnapshotDate("2026-07-01T12:00:00.000Z")).toMatch(/2026/);
  });

  it("returns an empty string for garbage input", () => {
    expect(formatSnapshotDate("not-a-date")).toBe("");
  });
});
