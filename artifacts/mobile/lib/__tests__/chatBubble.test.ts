/**
 * Contrast safety tests for chat bubble tinting.
 *
 * Empiri's personality tints the user-bubble gradient via spectrumForWarmth.
 * These tests lock in the contrast invariant across the full warmth range
 * (−0.15 … +0.15) so no future personality-tinting change silently drops text
 * below the readable floor.
 *
 * WCAG AA thresholds used here:
 *
 *   User bubbles — light mode (3:1)
 *     The brand gradient (#5B8CFF → #A855F7) is a deliberate design choice.
 *     At warmth=0 the stops produce ~3.1–3.9:1 against white, which meets the
 *     WCAG AA "large text" floor (3:1). The test enforces that warmth tinting
 *     never pushes any stop below this floor.
 *
 *   User bubbles — dark mode (4.5:1)
 *     Stops are composited at 30 % alpha over the near-black background, giving
 *     a very dark effective colour. White text on this dark surface comfortably
 *     exceeds 4.5:1.
 *
 *   Assistant bubbles — both modes (4.5:1)
 *     Assistant bubbles use static glass colours with no warmth tinting applied.
 *     Dark foreground on light glass (light mode) and near-white text on
 *     near-black glass (dark mode) both clear the full WCAG AA threshold.
 */

import { hexToRgba, spectrumForWarmth } from "../accent";
import colors from "../../constants/colors";

// ── WCAG contrast helpers ────────────────────────────────────────────────────

/** Linearise a single 0-255 channel for WCAG luminance calculation (IEC 61966-2-1). */
function linearize(c: number): number {
  const s = c / 255;
  return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
}

/** Relative luminance of a `#RRGGBB` colour (WCAG 2.1 §1.4.3). */
function luminance(hex: string): number {
  const h = hex.replace("#", "");
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return 0.2126 * linearize(r) + 0.7152 * linearize(g) + 0.0722 * linearize(b);
}

/** WCAG contrast ratio between two `#RRGGBB` colours. Always ≥ 1. */
function contrastRatio(a: string, b: string): number {
  const la = luminance(a);
  const lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/**
 * Alpha-composites an `rgba(r,g,b,a)` string over an opaque `#RRGGBB`
 * background, returning the effective `#RRGGBB` colour.
 */
function compositeOver(rgba: string, bgHex: string): string {
  const m = rgba.match(/rgba?\(\s*(\d+),\s*(\d+),\s*(\d+),\s*([\d.]+)\s*\)/);
  if (!m) return rgba;
  const [, rs, gs, bs, as] = m;
  const alpha = parseFloat(as);
  const fr = parseInt(rs), fg = parseInt(gs), fb = parseInt(bs);
  const bh = bgHex.replace("#", "");
  const br = parseInt(bh.slice(0, 2), 16);
  const bg = parseInt(bh.slice(2, 4), 16);
  const bb = parseInt(bh.slice(4, 6), 16);
  const er = Math.round(alpha * fr + (1 - alpha) * br);
  const eg = Math.round(alpha * fg + (1 - alpha) * bg);
  const eb = Math.round(alpha * fb + (1 - alpha) * bb);
  const hex = (n: number) => n.toString(16).padStart(2, "0");
  return `#${hex(er)}${hex(eg)}${hex(eb)}`;
}

// ── Test constants ───────────────────────────────────────────────────────────

const SPECTRUM = colors.light.spectrum; // shared across light/dark (same token)
/** Warmth values spanning the full personality range in even steps. */
const WARMTH_VALUES = [-0.15, -0.1, -0.05, 0, 0.05, 0.1, 0.15];

const USER_TEXT_HEX = colors.light.userBubbleText; // "#FFFFFF" — same in dark
const LIGHT_PAGE_BG = colors.light.background;     // "#F4F3FB"
const DARK_PAGE_BG = colors.dark.background;       // "#0A0A0C"

// ── User bubble — light mode ──────────────────────────────────────────────────

describe("user bubble — light mode — WCAG AA Large Text (3:1)", () => {
  it.each(WARMTH_VALUES)(
    "gradient stop 1 (blue end) passes at warmth %f",
    (warmth) => {
      const tinted = spectrumForWarmth(warmth, SPECTRUM);
      // Light mode: stop is a solid #RRGGBB (no alpha compositing needed).
      const ratio = contrastRatio(tinted[0], USER_TEXT_HEX);
      expect(ratio).toBeGreaterThanOrEqual(3.0);
    },
  );

  it.each(WARMTH_VALUES)(
    "gradient stop 2 (purple end) passes at warmth %f",
    (warmth) => {
      const tinted = spectrumForWarmth(warmth, SPECTRUM);
      const ratio = contrastRatio(tinted[1], USER_TEXT_HEX);
      expect(ratio).toBeGreaterThanOrEqual(3.0);
    },
  );
});

// ── User bubble — dark mode ───────────────────────────────────────────────────

describe("user bubble — dark mode — WCAG AA (4.5:1)", () => {
  it.each(WARMTH_VALUES)(
    "gradient stop 1 composited at 30 % passes at warmth %f",
    (warmth) => {
      const tinted = spectrumForWarmth(warmth, SPECTRUM);
      // Dark mode compositing: stops are rendered at 30 % alpha over the page bg.
      const effectiveBg = compositeOver(hexToRgba(tinted[0], 0.3), DARK_PAGE_BG);
      const ratio = contrastRatio(effectiveBg, USER_TEXT_HEX);
      expect(ratio).toBeGreaterThanOrEqual(4.5);
    },
  );

  it.each(WARMTH_VALUES)(
    "gradient stop 2 composited at 30 % passes at warmth %f",
    (warmth) => {
      const tinted = spectrumForWarmth(warmth, SPECTRUM);
      const effectiveBg = compositeOver(hexToRgba(tinted[1], 0.3), DARK_PAGE_BG);
      const ratio = contrastRatio(effectiveBg, USER_TEXT_HEX);
      expect(ratio).toBeGreaterThanOrEqual(4.5);
    },
  );
});

// ── Assistant bubble (no tinting — static glass colours) ─────────────────────

describe("assistant bubble — light mode — WCAG AA (4.5:1)", () => {
  it("glass background + dark foreground text passes", () => {
    // glass = rgba(255,255,255,0.62) composited over the page background.
    const effectiveBg = compositeOver(colors.light.glass, LIGHT_PAGE_BG);
    const text = colors.light.cardForeground; // "#16131F" — opaque, no compositing needed
    expect(contrastRatio(effectiveBg, text)).toBeGreaterThanOrEqual(4.5);
  });
});

describe("assistant bubble — dark mode — WCAG AA (4.5:1)", () => {
  it("glass background + near-white foreground text passes", () => {
    // glass = rgba(255,255,255,0.05) composited over the dark page background.
    const effectiveBg = compositeOver(colors.dark.glass, DARK_PAGE_BG);
    // Text is rgba(255,255,255,0.92) — composite over the effective glass bg
    // to get the perceived text colour for contrast measurement.
    const effectiveText = compositeOver(colors.dark.cardForeground, effectiveBg);
    expect(contrastRatio(effectiveBg, effectiveText)).toBeGreaterThanOrEqual(4.5);
  });
});
