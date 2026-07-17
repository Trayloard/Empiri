import { accentForWarmth, mixHex, spectrumForWarmth } from "../accent";

const STATUS_ACCENT = "#7C3AED";
const SPECTRUM = ["#5B8CFF", "#A855F7", "#EC4899", "#FB923C"] as const;

function rgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  return [
    parseInt(h.slice(0, 2), 16),
    parseInt(h.slice(2, 4), 16),
    parseInt(h.slice(4, 6), 16),
  ];
}

describe("mixHex", () => {
  it("returns the first color at t=0 and the second at t=1", () => {
    expect(mixHex("#000000", "#ffffff", 0)).toBe("#000000");
    expect(mixHex("#000000", "#ffffff", 1)).toBe("#ffffff");
  });

  it("blends halfway", () => {
    expect(mixHex("#000000", "#ffffff", 0.5)).toBe("#808080");
  });

  it("clamps t outside 0–1", () => {
    expect(mixHex("#000000", "#ffffff", -1)).toBe("#000000");
    expect(mixHex("#000000", "#ffffff", 2)).toBe("#ffffff");
  });
});

describe("accentForWarmth", () => {
  it("returns the neutral status accent when warmth is centred", () => {
    expect(accentForWarmth(0, STATUS_ACCENT, SPECTRUM).toLowerCase()).toBe(
      STATUS_ACCENT.toLowerCase(),
    );
  });

  it("leans warmer (more red, less blue) for a warm personality", () => {
    const [nr, , nb] = rgb(STATUS_ACCENT);
    const [wr, , wb] = rgb(accentForWarmth(0.15, STATUS_ACCENT, SPECTRUM));
    expect(wr).toBeGreaterThan(nr);
    expect(wb).toBeLessThan(nb);
  });

  it("leans cooler (more blue, less red) for a cool personality", () => {
    const [nr, , nb] = rgb(STATUS_ACCENT);
    const [cr, , cb] = rgb(accentForWarmth(-0.15, STATUS_ACCENT, SPECTRUM));
    expect(cb).toBeGreaterThan(nb);
    expect(cr).toBeLessThan(nr);
  });

  it("clamps beyond the saturation range", () => {
    expect(accentForWarmth(0.5, STATUS_ACCENT, SPECTRUM)).toBe(
      accentForWarmth(0.15, STATUS_ACCENT, SPECTRUM),
    );
    expect(accentForWarmth(-0.5, STATUS_ACCENT, SPECTRUM)).toBe(
      accentForWarmth(-0.15, STATUS_ACCENT, SPECTRUM),
    );
  });

  it("stays subtle — never blends all the way to a spectrum anchor", () => {
    const warm = accentForWarmth(0.15, STATUS_ACCENT, SPECTRUM).toLowerCase();
    const cool = accentForWarmth(-0.15, STATUS_ACCENT, SPECTRUM).toLowerCase();
    expect(warm).not.toBe(SPECTRUM[2].toLowerCase());
    expect(cool).not.toBe(SPECTRUM[0].toLowerCase());
  });
});

describe("spectrumForWarmth", () => {
  it("returns the spectrum unchanged for a neutral personality", () => {
    const out = spectrumForWarmth(0, SPECTRUM);
    expect(out.map((c) => c.toLowerCase())).toEqual(
      SPECTRUM.map((c) => c.toLowerCase()),
    );
  });

  it("leans each stop warmer (more red) for a warm personality", () => {
    const out = spectrumForWarmth(0.15, SPECTRUM);
    // The blue anchor moves toward pink…
    expect(rgb(out[0])[0]).toBeGreaterThan(rgb(SPECTRUM[0])[0]);
    // …while pink itself stays put (blending toward itself is a no-op).
    expect(out[2].toLowerCase()).toBe(SPECTRUM[2].toLowerCase());
  });

  it("leans each stop cooler (more blue) for a cool personality", () => {
    const out = spectrumForWarmth(-0.15, SPECTRUM);
    expect(rgb(out[2])[2]).toBeGreaterThan(rgb(SPECTRUM[2])[2]);
    expect(out[0].toLowerCase()).toBe(SPECTRUM[0].toLowerCase());
  });

  it("shifts more gently than the flat accent", () => {
    // Same base, same warmth: gradient stop must stay closer to its origin.
    const flat = rgb(accentForWarmth(0.15, SPECTRUM[0], SPECTRUM));
    const grad = rgb(spectrumForWarmth(0.15, SPECTRUM)[0]);
    const base = rgb(SPECTRUM[0]);
    expect(Math.abs(grad[0] - base[0])).toBeLessThan(
      Math.abs(flat[0] - base[0]),
    );
  });
});
