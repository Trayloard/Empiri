import {
  ambientBlobOpacity,
  orbBlobOpacity,
  type AmbientBlobKind,
  type OrbBlobKind,
} from "@/lib/orbOpacity";
import { NEUTRAL_INFLUENCE } from "@/lib/traitInfluence";

const ORB_KINDS: OrbBlobKind[] = [
  "halo",
  "blue",
  "purple",
  "pink",
  "orange",
  "core",
];
const AMBIENT_KINDS: AmbientBlobKind[] = ["top", "left", "right", "bottom"];

// Mood/status dynamics as configured in CompanionOrb.tsx.
const MOOD_DYNAMICS = {
  bright: { intensity: 1.0, coreBoost: 1.0 },
  happy: { intensity: 0.95, coreBoost: 0.95 },
  content: { intensity: 0.88, coreBoost: 0.9 },
  low: { intensity: 0.72, coreBoost: 0.78 },
  sleepy: { intensity: 0.58, coreBoost: 0.66 },
  sad: { intensity: 0.48, coreBoost: 0.55 },
} as const;

const ACTIVE_DYNAMICS = {
  thinking: { intensity: 1.0, coreBoost: 1.15 },
  listening: { intensity: 1.18, coreBoost: 1.3 },
  speaking: { intensity: 1.12, coreBoost: 1.25 },
} as const;

const { warmthShift: W0, glowBoost: G0 } = NEUTRAL_INFLUENCE;

function orbAtNeutral(kind: OrbBlobKind, intensity: number, coreBoost: number) {
  return orbBlobOpacity(kind, intensity, coreBoost, G0, W0);
}

/** The pre-smoothstep formula: warm tones flip on a boolean threshold. */
function legacyOrbWarmTone(
  kind: "pink" | "orange",
  baseIntensity: number,
  glowBoost: number,
  warmthShift: number,
) {
  const intensity = Math.min(1, baseIntensity + glowBoost);
  const warmBoost = warmthShift * 0.4;
  const warm = intensity >= 0.85 - warmthShift * 1.5;
  if (kind === "pink") {
    return Math.min(1, (warm ? 0.85 : 0.5) * intensity + warmBoost);
  }
  return Math.min(1, (warm ? 0.7 : 0.32) * intensity + warmBoost * 0.8);
}

describe("orbBlobOpacity — neutral baselines", () => {
  it("matches the documented resting baseline for every mood at neutral traits", () => {
    // opacity = clamp of the documented per-kind formulas with zero trait
    // contribution. Snapshot each mood so a formula edit is caught.
    const table: Record<string, Record<OrbBlobKind, number>> = {};
    for (const [mood, d] of Object.entries(MOOD_DYNAMICS)) {
      table[mood] = Object.fromEntries(
        ORB_KINDS.map((k) => [
          k,
          Number(orbAtNeutral(k, d.intensity, d.coreBoost).toFixed(6)),
        ]),
      ) as Record<OrbBlobKind, number>;
    }
    expect(table).toEqual({
      bright: {
        halo: 0.45,
        blue: 0.9,
        purple: 0.9,
        pink: 0.85,
        orange: 0.7,
        core: 0.85,
      },
      happy: {
        halo: 0.4275,
        blue: 0.855,
        purple: 0.855,
        pink: 0.8075,
        orange: 0.665,
        core: 0.8075,
      },
      content: {
        halo: 0.396,
        blue: 0.792,
        purple: 0.792,
        pink: 0.748,
        orange: 0.616,
        core: 0.765,
      },
      low: {
        halo: 0.324,
        blue: 0.648,
        purple: 0.648,
        pink: 0.36,
        orange: 0.2304,
        core: 0.663,
      },
      sleepy: {
        halo: 0.261,
        blue: 0.522,
        purple: 0.522,
        pink: 0.29,
        orange: 0.1856,
        core: 0.561,
      },
      sad: {
        halo: 0.216,
        blue: 0.432,
        purple: 0.432,
        pink: 0.24,
        orange: 0.1536,
        core: 0.4675,
      },
    });
  });

  it("matches the documented resting baseline for active statuses at neutral traits", () => {
    for (const [, d] of Object.entries(ACTIVE_DYNAMICS)) {
      // intensity clamps to 1 for all active states
      expect(orbAtNeutral("halo", d.intensity, d.coreBoost)).toBeCloseTo(
        0.45,
        10,
      );
      expect(orbAtNeutral("blue", d.intensity, d.coreBoost)).toBeCloseTo(
        0.9,
        10,
      );
      expect(orbAtNeutral("pink", d.intensity, d.coreBoost)).toBeCloseTo(
        0.85,
        10,
      );
      expect(orbAtNeutral("orange", d.intensity, d.coreBoost)).toBeCloseTo(
        0.7,
        10,
      );
      expect(orbAtNeutral("core", d.intensity, d.coreBoost)).toBeCloseTo(
        Math.min(1, 0.85 * Math.min(1.35, d.coreBoost)),
        10,
      );
    }
  });
});

describe("orbBlobOpacity — warmthShift direction", () => {
  const cases = Object.values(MOOD_DYNAMICS);

  it("raising warmthShift brightens pink and orange, dims blue", () => {
    for (const d of cases) {
      const warm = 0.15;
      for (const kind of ["pink", "orange"] as const) {
        expect(
          orbBlobOpacity(kind, d.intensity, d.coreBoost, G0, warm),
        ).toBeGreaterThan(orbAtNeutral(kind, d.intensity, d.coreBoost));
      }
      expect(
        orbBlobOpacity("blue", d.intensity, d.coreBoost, G0, warm),
      ).toBeLessThan(orbAtNeutral("blue", d.intensity, d.coreBoost));
      expect(
        orbBlobOpacity("purple", d.intensity, d.coreBoost, G0, warm),
      ).toBeLessThanOrEqual(orbAtNeutral("purple", d.intensity, d.coreBoost));
    }
  });

  it("negative warmthShift cools: pink/orange dim, blue floor holds", () => {
    const d = MOOD_DYNAMICS.content;
    const cool = -0.15;
    expect(
      orbBlobOpacity("pink", d.intensity, d.coreBoost, G0, cool),
    ).toBeLessThan(orbAtNeutral("pink", d.intensity, d.coreBoost));
    expect(
      orbBlobOpacity("blue", d.intensity, d.coreBoost, G0, cool),
    ).toBeGreaterThanOrEqual(orbAtNeutral("blue", d.intensity, d.coreBoost));
    // Floors never violated
    expect(
      orbBlobOpacity("blue", 0, 0, 0, 0.3),
    ).toBeGreaterThanOrEqual(0.3);
    expect(
      orbBlobOpacity("purple", 0, 0, 0, 0.3),
    ).toBeGreaterThanOrEqual(0.35);
  });
});

describe("orbBlobOpacity — glowBoost direction", () => {
  it("raising glowBoost increases (or holds at clamp) every blob's opacity", () => {
    for (const d of Object.values(MOOD_DYNAMICS)) {
      for (const kind of ORB_KINDS) {
        const base = orbAtNeutral(kind, d.intensity, d.coreBoost);
        const boosted = orbBlobOpacity(
          kind,
          d.intensity,
          d.coreBoost,
          0.22,
          W0,
        );
        expect(boosted).toBeGreaterThanOrEqual(base);
      }
    }
  });

  it("strictly increases where the clamp isn't hit (sad mood)", () => {
    const d = MOOD_DYNAMICS.sad;
    for (const kind of ORB_KINDS) {
      expect(
        orbBlobOpacity(kind, d.intensity, d.coreBoost, 0.22, W0),
      ).toBeGreaterThan(orbAtNeutral(kind, d.intensity, d.coreBoost));
    }
  });
});

describe("orbBlobOpacity — smoothstep warm ramp vs legacy boolean", () => {
  it("reaches full warmth exactly at the threshold (no resting change vs old boolean)", () => {
    // At every resting mood/status intensity, the smoothstep must equal the
    // legacy boolean formula: full warmth at/above threshold, and identical
    // below the ramp window.
    const intensities = [
      ...Object.values(MOOD_DYNAMICS).map((d) => d.intensity),
      ...Object.values(ACTIVE_DYNAMICS).map((d) => d.intensity),
    ];
    for (const warmthShift of [-0.15, 0, 0.15]) {
      const threshold = 0.85 - warmthShift * 1.5;
      for (const baseIntensity of intensities) {
        const intensity = Math.min(1, baseIntensity + G0);
        // Only assert equivalence outside the softened 0.1 window below the
        // threshold — inside it the ramp intentionally differs.
        const inRamp = intensity > threshold - 0.1 && intensity < threshold;
        if (inRamp) continue;
        for (const kind of ["pink", "orange"] as const) {
          expect(
            orbBlobOpacity(kind, baseIntensity, 1, G0, warmthShift),
          ).toBeCloseTo(
            legacyOrbWarmTone(kind, baseIntensity, G0, warmthShift),
            10,
          );
        }
      }
    }
  });

  it("hits exactly 1.0 warm ramp at the threshold and 0 at the window bottom", () => {
    const warmthShift = 0;
    const threshold = 0.85;
    // At the threshold: full warm coefficient (0.85 for pink)
    expect(orbBlobOpacity("pink", threshold, 1, 0, warmthShift)).toBeCloseTo(
      0.85 * threshold,
      10,
    );
    // At the window bottom: cool coefficient (0.5 for pink)
    expect(
      orbBlobOpacity("pink", threshold - 0.1, 1, 0, warmthShift),
    ).toBeCloseTo(0.5 * (threshold - 0.1), 10);
    // Same for orange (0.7 warm / 0.32 cool)
    expect(orbBlobOpacity("orange", threshold, 1, 0, warmthShift)).toBeCloseTo(
      0.7 * threshold,
      10,
    );
    expect(
      orbBlobOpacity("orange", threshold - 0.1, 1, 0, warmthShift),
    ).toBeCloseTo(0.32 * (threshold - 0.1), 10);
  });

  it("is monotonic (no snap) across the ramp window", () => {
    let prev = -Infinity;
    for (let i = 0; i <= 100; i++) {
      const intensity = 0.7 + (0.25 * i) / 100;
      const v = orbBlobOpacity("pink", intensity, 1, 0, 0);
      expect(v).toBeGreaterThanOrEqual(prev);
      // No boolean-style jump between adjacent samples
      if (prev > -Infinity) expect(v - prev).toBeLessThan(0.02);
      prev = v;
    }
  });
});

describe("ambientBlobOpacity", () => {
  const REST = 0.6;
  const ACTIVE = 1;

  it("matches the documented baseline at neutral traits", () => {
    expect(ambientBlobOpacity("top", REST, G0, W0)).toBeCloseTo(0.3, 10);
    expect(ambientBlobOpacity("left", REST, G0, W0)).toBeCloseTo(0.24, 10);
    expect(ambientBlobOpacity("right", REST, G0, W0)).toBeCloseTo(0.228, 10);
    expect(ambientBlobOpacity("bottom", REST, G0, W0)).toBeCloseTo(0.18, 10);

    expect(ambientBlobOpacity("top", ACTIVE, G0, W0)).toBeCloseTo(0.5, 10);
    expect(ambientBlobOpacity("left", ACTIVE, G0, W0)).toBeCloseTo(0.4, 10);
    expect(ambientBlobOpacity("right", ACTIVE, G0, W0)).toBeCloseTo(0.38, 10);
    expect(ambientBlobOpacity("bottom", ACTIVE, G0, W0)).toBeCloseTo(0.3, 10);
  });

  it("raising warmthShift boosts pink and never brightens the blues", () => {
    const warm = 0.15;
    expect(ambientBlobOpacity("right", REST, G0, warm)).toBeGreaterThan(
      ambientBlobOpacity("right", REST, G0, W0),
    );
    // Positive warmth doesn't cool-damp blues (coolDamp = 0) — unchanged.
    expect(ambientBlobOpacity("left", REST, G0, warm)).toBeCloseTo(
      ambientBlobOpacity("left", REST, G0, W0),
      10,
    );
    // Negative warmth dims the blues.
    expect(ambientBlobOpacity("left", REST, G0, -warm)).toBeLessThan(
      ambientBlobOpacity("left", REST, G0, W0),
    );
    expect(ambientBlobOpacity("bottom", REST, G0, -warm)).toBeLessThan(
      ambientBlobOpacity("bottom", REST, G0, W0),
    );
    // Floors hold.
    expect(ambientBlobOpacity("left", 0, 0, -1)).toBeGreaterThanOrEqual(0.15);
    expect(ambientBlobOpacity("bottom", 0, 0, -1)).toBeGreaterThanOrEqual(0.1);
  });

  it("raising glowBoost increases every blob's opacity at rest", () => {
    for (const kind of AMBIENT_KINDS) {
      expect(ambientBlobOpacity(kind, REST, 0.22, W0)).toBeGreaterThan(
        ambientBlobOpacity(kind, REST, G0, W0),
      );
    }
  });

  it("pink cap (0.75) is respected", () => {
    expect(ambientBlobOpacity("right", 5, 5, 5)).toBeLessThanOrEqual(0.75);
  });
});

// ---------------------------------------------------------------------------
// Snapshot suite — records exact opacity values across a {warmthShift,
// glowBoost} grid so any formula change produces an explicit diff.
// ---------------------------------------------------------------------------

const TRAIT_GRID = [
  { warmthShift: -1, glowBoost: 0 },
  { warmthShift: -1, glowBoost: 1 },
  { warmthShift: 0, glowBoost: 0 },
  { warmthShift: 0, glowBoost: 0.15 },
  { warmthShift: 0, glowBoost: 0.22 },
  { warmthShift: 0, glowBoost: 1 },
  { warmthShift: 0.15, glowBoost: 0 },
  { warmthShift: 0.15, glowBoost: 0.22 },
  { warmthShift: 1, glowBoost: 0 },
  { warmthShift: 1, glowBoost: 1 },
] as const;

function round6(n: number) {
  return Math.round(n * 1e6) / 1e6;
}

describe("orbBlobOpacity — snapshot grid (content mood)", () => {
  const { intensity, coreBoost } = MOOD_DYNAMICS.content;

  it("matches stored opacity table across trait grid", () => {
    const table = TRAIT_GRID.map(({ warmthShift, glowBoost }) => ({
      warmthShift,
      glowBoost,
      opacities: Object.fromEntries(
        ORB_KINDS.map((k) => [
          k,
          round6(orbBlobOpacity(k, intensity, coreBoost, glowBoost, warmthShift)),
        ]),
      ),
    }));
    expect(table).toMatchSnapshot();
  });
});

describe("orbBlobOpacity — snapshot grid (bright mood)", () => {
  const { intensity, coreBoost } = MOOD_DYNAMICS.bright;

  it("matches stored opacity table across trait grid", () => {
    const table = TRAIT_GRID.map(({ warmthShift, glowBoost }) => ({
      warmthShift,
      glowBoost,
      opacities: Object.fromEntries(
        ORB_KINDS.map((k) => [
          k,
          round6(orbBlobOpacity(k, intensity, coreBoost, glowBoost, warmthShift)),
        ]),
      ),
    }));
    expect(table).toMatchSnapshot();
  });
});

describe("orbBlobOpacity — snapshot edge clamp (sad mood)", () => {
  const { intensity, coreBoost } = MOOD_DYNAMICS.sad;

  it("edge warmthShift/glowBoost values are clamped correctly", () => {
    const table = TRAIT_GRID.map(({ warmthShift, glowBoost }) => ({
      warmthShift,
      glowBoost,
      opacities: Object.fromEntries(
        ORB_KINDS.map((k) => [
          k,
          round6(orbBlobOpacity(k, intensity, coreBoost, glowBoost, warmthShift)),
        ]),
      ),
    }));
    expect(table).toMatchSnapshot();
  });
});

describe("ambientBlobOpacity — snapshot grid", () => {
  const BASE_INTENSITIES = [0.48, 0.88, 1.0] as const;

  it("matches stored opacity table across trait grid (rest / content / active)", () => {
    const table = BASE_INTENSITIES.flatMap((baseIntensity) =>
      TRAIT_GRID.map(({ warmthShift, glowBoost }) => ({
        baseIntensity,
        warmthShift,
        glowBoost,
        opacities: Object.fromEntries(
          AMBIENT_KINDS.map((k) => [
            k,
            round6(ambientBlobOpacity(k, baseIntensity, glowBoost, warmthShift)),
          ]),
        ),
      })),
    );
    expect(table).toMatchSnapshot();
  });
});
