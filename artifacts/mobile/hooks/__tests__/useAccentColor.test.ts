import { act, renderHook } from "@testing-library/react-native";

import { accentForWarmth } from "@/lib/accent";
import { useAccentColor, useSmoothedWarmth } from "../useAccentColor";

/**
 * Regression coverage for the accent smoothing layer: a new warmth target must
 * ease the accent over time (never hard-flip), except under reduced motion
 * where it snaps immediately. A retarget mid-tween must continue from the
 * current eased value instead of jumping.
 */

const mockUseReducedMotion = jest.fn<boolean, []>();
jest.mock("react-native-reanimated", () => ({
  useReducedMotion: () => mockUseReducedMotion(),
}));

const COLORS = {
  statusAccent: "#7C3AED",
  spectrum: ["#5B8CFF", "#A855F7", "#EC4899", "#FB923C"],
};
jest.mock("@/hooks/useColors", () => ({
  useColors: () => COLORS,
}));

/** Matches TWEEN_MS in the hook. */
const TWEEN_MS = 900;
const FRAME_MS = 16;

beforeEach(() => {
  jest.useFakeTimers();
  // Drive requestAnimationFrame off the fake-timer clock so we can step the
  // tween deterministically (Date.now is also mocked by modern fake timers).
  global.requestAnimationFrame = ((cb: FrameRequestCallback) =>
    setTimeout(() => cb(Date.now()), FRAME_MS)) as never;
  global.cancelAnimationFrame = ((id: number) =>
    clearTimeout(id as never)) as never;
  mockUseReducedMotion.mockReturnValue(false);
});

afterEach(() => {
  jest.useRealTimers();
  jest.clearAllMocks();
});

function advance(ms: number) {
  act(() => {
    jest.advanceTimersByTime(ms);
  });
}

describe("useSmoothedWarmth", () => {
  it("snaps to the new value immediately when reduced motion is on", () => {
    mockUseReducedMotion.mockReturnValue(true);
    const { result, rerender } = renderHook(
      ({ w }: { w: number }) => useSmoothedWarmth(w),
      { initialProps: { w: 0 } },
    );

    rerender({ w: 0.15 });
    // No timers advanced: the value must already be at the target.
    expect(result.current).toBe(0.15);
  });

  it("eases toward a new target instead of jumping, and lands on it", () => {
    const { result, rerender } = renderHook(
      ({ w }: { w: number }) => useSmoothedWarmth(w),
      { initialProps: { w: 0 } },
    );
    expect(result.current).toBe(0);

    rerender({ w: 0.15 });
    // Immediately after the target changes, nothing has moved yet.
    expect(result.current).toBe(0);

    // After a couple of frames the value has started moving but is nowhere
    // near the target — no hard flip.
    advance(FRAME_MS * 3);
    expect(result.current).toBeGreaterThan(0);
    expect(result.current).toBeLessThan(0.15 * 0.5);

    // Halfway through it is strictly between start and target.
    advance(TWEEN_MS / 2 - FRAME_MS * 3);
    expect(result.current).toBeGreaterThan(0);
    expect(result.current).toBeLessThan(0.15);

    // After the full tween it lands exactly on the target.
    advance(TWEEN_MS);
    expect(result.current).toBe(0.15);
  });

  it("continues from the current eased value when retargeted mid-tween", () => {
    const { result, rerender } = renderHook(
      ({ w }: { w: number }) => useSmoothedWarmth(w),
      { initialProps: { w: 0 } },
    );

    rerender({ w: 0.15 });
    advance(TWEEN_MS / 2);
    const midValue = result.current;
    expect(midValue).toBeGreaterThan(0);
    expect(midValue).toBeLessThan(0.15);

    // Retarget toward the cool pole mid-transition.
    rerender({ w: -0.15 });
    // The very next frame must move only slightly from the mid value —
    // no jump back to 0 and no snap to the new target.
    advance(FRAME_MS);
    const step = result.current;
    expect(Math.abs(step - midValue)).toBeLessThan(0.03);
    expect(step).toBeLessThanOrEqual(midValue);
    expect(step).toBeGreaterThan(-0.15);

    // And the new tween still lands on the new target.
    advance(TWEEN_MS + FRAME_MS);
    expect(result.current).toBeCloseTo(-0.15, 10);
  });
});

describe("useAccentColor", () => {
  it("derives the color from the smoothed warmth and lands on the target color", () => {
    const { result, rerender } = renderHook(
      ({ w }: { w: number }) => useAccentColor(w),
      { initialProps: { w: 0 } },
    );
    expect(result.current.toLowerCase()).toBe(
      COLORS.statusAccent.toLowerCase(),
    );

    rerender({ w: 0.15 });
    // Mid-tween the color has left the neutral accent but is not yet the
    // fully-warm target.
    advance(TWEEN_MS / 2);
    const target = accentForWarmth(0.15, COLORS.statusAccent, COLORS.spectrum);
    expect(result.current.toLowerCase()).not.toBe(
      COLORS.statusAccent.toLowerCase(),
    );
    expect(result.current.toLowerCase()).not.toBe(target.toLowerCase());

    advance(TWEEN_MS);
    expect(result.current.toLowerCase()).toBe(target.toLowerCase());
  });
});
