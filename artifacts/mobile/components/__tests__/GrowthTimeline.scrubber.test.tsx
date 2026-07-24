import React from "react";
import { act, render, waitFor, within } from "@testing-library/react-native";

import {
  getCompanionSelfHistory,
  type CompanionSelf,
  type CompanionSelfSnapshot,
} from "@workspace/api-client-react";

import { GrowthTimeline } from "../GrowthTimeline";

/**
 * Scrubber (gesture) tests for the GrowthTimeline personality chart.
 *
 * The chart responds to both pan gestures and taps:
 *  - Pan begin/update → shows the scrubber readout at the nearest snapshot
 *  - Pan end → hides the readout immediately
 *  - Tap → shows the readout then auto-dismisses after 1.5 s
 *
 * Strategy: the component uses react-native-gesture-handler + Reanimated
 * worklets. The mocks below stub these to plain View / passthrough functions.
 * The key trick is capturing the gesture callbacks (onBegin, onUpdate, onEnd,
 * Tap.onEnd) into module-scope variables — prefixed "mock" so Jest's babel
 * plugin permits their use inside jest.mock factories. Tests then call those
 * captured functions directly to drive the component state.
 */

// Gesture callback captures — `mock` prefix lets Jest's hoisting plugin see
// them inside the jest.mock() factory below.
/* eslint-disable no-var */
var mockTapEnd: ((e: { x: number }) => void) | undefined;
var mockPanBegin: ((e: { x: number }) => void) | undefined;
var mockPanMove: ((e: { x: number }) => void) | undefined;
var mockPanEnd: (() => void) | undefined;
var mockSelectionAsync: jest.Mock;
/* eslint-enable no-var */

jest.mock("expo-haptics", () => {
  mockSelectionAsync = jest.fn().mockResolvedValue(undefined);
  return { selectionAsync: mockSelectionAsync };
});

jest.mock("@expo/vector-icons", () => ({ Feather: () => null }));

jest.mock("react-native-svg", () => {
  const { View } = require("react-native");
  return {
    __esModule: true,
    default: View,
    Path: View,
    Circle: View,
    Line: View,
  };
});

jest.mock("react-native-reanimated", () => {
  const { View } = require("react-native");
  return {
    __esModule: true,
    default: { View },
    useSharedValue: (v: unknown) => ({ value: v }),
    useAnimatedStyle: () => ({}),
    useReducedMotion: () => true,
    withTiming: (v: unknown) => v,
    runOnJS: (fn: (...args: unknown[]) => void) => fn,
    Easing: {
      inOut: () => () => 0,
      out: () => () => 0,
      cubic: () => 0,
    },
  };
});

jest.mock("react-native-gesture-handler", () => {
  const makePan = (): Record<string, unknown> => ({
    minDistance: () => makePan(),
    onBegin: (fn: (e: { x: number }) => void) => {
      mockPanBegin = fn;
      return makePan();
    },
    onUpdate: (fn: (e: { x: number }) => void) => {
      mockPanMove = fn;
      return makePan();
    },
    onEnd: (fn: () => void) => {
      mockPanEnd = fn;
      return makePan();
    },
    onFinalize: () => makePan(),
  });

  const makeTap = (): Record<string, unknown> => ({
    onEnd: (fn: (e: { x: number }) => void) => {
      mockTapEnd = fn;
      return makeTap();
    },
  });

  const Gesture = {
    Tap: () => makeTap(),
    Pan: () => makePan(),
    Race: (..._: unknown[]) => ({}),
  };

  return {
    Gesture,
    GestureDetector: ({ children }: { children: React.ReactNode }) => children,
  };
});

jest.mock("@workspace/api-client-react");

const mockGetHistory = getCompanionSelfHistory as jest.MockedFunction<
  typeof getCompanionSelfHistory
>;

// Build snapshot timestamps relative to real Date.now() at module-load time
// so the live "now" point (appended by buildTimeline) lands at xs[2] = 1.0
// and the two snapshots sit at xs[0] = 0 and xs[1] ≈ 0.5 regardless of
// when the suite runs.
const MODULE_NOW = Date.now();

const SNAPSHOTS: CompanionSelfSnapshot[] = [
  {
    capturedAt: new Date(MODULE_NOW - 1_000_000).toISOString(),
    interactions: 4,
    drives: [],
    traits: [
      { key: "warmth", value: 30 },
      { key: "curiosity", value: 40 },
      { key: "playfulness", value: 50 },
      { key: "openness", value: 60 },
      { key: "calm", value: 70 },
    ],
    interests: [],
  },
  {
    capturedAt: new Date(MODULE_NOW - 500_000).toISOString(),
    interactions: 8,
    drives: [],
    traits: [
      { key: "warmth", value: 50 },
      { key: "curiosity", value: 55 },
      { key: "playfulness", value: 60 },
      { key: "openness", value: 65 },
      { key: "calm", value: 70 },
    ],
    interests: [{ topic: "stars", display: "Stars", affinity: 40 }],
  },
];

const SELF: CompanionSelf = {
  traits: [
    { key: "warmth", value: 62 },
    { key: "curiosity", value: 68 },
    { key: "playfulness", value: 72 },
    { key: "openness", value: 75 },
    { key: "calm", value: 80 },
  ],
  drives: [],
  interests: [],
  narrative: [],
  facts: [],
  chapters: [],
  interactions: 12,
  ageHours: 30,
  themes: null,
};

beforeEach(() => {
  mockTapEnd = undefined;
  mockPanBegin = undefined;
  mockPanMove = undefined;
  mockPanEnd = undefined;
  mockGetHistory.mockResolvedValue({ snapshots: SNAPSHOTS });
});

afterEach(() => {
  jest.clearAllMocks();
});

async function renderAndWait() {
  const utils = render(
    <GrowthTimeline conversationId={1} self={SELF} bottomInset={0} />,
  );
  // findByTestId retries with act() until the async history fetch resolves
  // and the chart becomes visible — same pattern as GrowthTimeline.retry.test.tsx.
  // Extended timeout covers first-test module warm-up latency.
  await utils.findByTestId("growth-timeline", undefined, { timeout: 15000 });
  return utils;
}

describe("GrowthTimeline scrubber — pan gesture", () => {
  // Extended timeout: the first test in the suite pays the module warm-up
  // cost, which can exceed the default 5 s when suites run in parallel.
  it("shows the readout when a pan begins", async () => {
    const { queryByTestId } = await renderAndWait();

    expect(queryByTestId("scrubber-readout")).toBeNull();

    await act(async () => {
      mockPanBegin?.({ x: 0 });
    });

    expect(queryByTestId("scrubber-readout")).toBeTruthy();
  }, 20_000);

  it("keeps the readout visible as the pan moves", async () => {
    const { queryByTestId } = await renderAndWait();

    await act(async () => {
      mockPanBegin?.({ x: 0 });
    });
    expect(queryByTestId("scrubber-readout")).toBeTruthy();

    await act(async () => {
      mockPanMove?.({ x: 50 });
    });
    expect(queryByTestId("scrubber-readout")).toBeTruthy();
  });

  it("keeps the readout visible after the pan ends (linger period)", async () => {
    const { queryByTestId } = await renderAndWait();

    await act(async () => {
      mockPanBegin?.({ x: 0 });
    });
    expect(queryByTestId("scrubber-readout")).toBeTruthy();

    jest.useFakeTimers();
    try {
      await act(async () => {
        mockPanEnd?.();
      });
      // Still visible — linger period active.
      expect(queryByTestId("scrubber-readout")).toBeTruthy();

      // Advance past the 1200 ms linger.
      act(() => { jest.advanceTimersByTime(1300); });
      expect(queryByTestId("scrubber-readout")).toBeNull();
    } finally {
      jest.useRealTimers();
    }
  });

  it("a new pan begun during the linger cancels the hide timer", async () => {
    const { queryByTestId } = await renderAndWait();

    await act(async () => {
      mockPanBegin?.({ x: 0 });
    });

    jest.useFakeTimers();
    try {
      // Release — starts 1200 ms linger.
      await act(async () => { mockPanEnd?.(); });
      expect(queryByTestId("scrubber-readout")).toBeTruthy();

      // New pan begins within the linger — cancels the pending hide.
      await act(async () => { mockPanBegin?.({ x: 999_999 }); });

      // Advance well past where the original timer would have fired.
      act(() => { jest.advanceTimersByTime(2000); });
      expect(queryByTestId("scrubber-readout")).toBeTruthy();

      // Clean up — end the pan and let the new linger expire.
      await act(async () => { mockPanEnd?.(); });
      act(() => { jest.advanceTimersByTime(1300); });
      expect(queryByTestId("scrubber-readout")).toBeNull();
    } finally {
      jest.useRealTimers();
    }
  });

  it("selects the first snapshot when panning at x = 0", async () => {
    const { queryByTestId, getByTestId } = await renderAndWait();

    await act(async () => {
      mockPanBegin?.({ x: 0 });
    });

    expect(queryByTestId("scrubber-readout")).toBeTruthy();
    // The first snapshot is a historical point — "now" must not appear inside
    // the readout. (The axis tick "now" outside the readout is fine.)
    expect(
      within(getByTestId("scrubber-readout")).queryByText("now"),
    ).toBeNull();
  });

  it("selects the 'now' point when panning to a very large x (clamps to 1.0)", async () => {
    const { queryByTestId, getByTestId } = await renderAndWait();

    await act(async () => {
      mockPanBegin?.({ x: 999_999 });
    });

    expect(queryByTestId("scrubber-readout")).toBeTruthy();
    // The axis tick also says "now", so scope the check to the readout itself.
    expect(within(getByTestId("scrubber-readout")).getByText("now")).toBeTruthy();
  });

  it("shows trait values for the selected snapshot in the readout", async () => {
    const { queryByTestId, getByTestId, getByText } = await renderAndWait();

    // Pan to x=0 → nearestTimelineIndex picks the first snapshot.
    // First snapshot has warmth=30 (rendered as "30").
    await act(async () => {
      mockPanBegin?.({ x: 0 });
    });

    expect(queryByTestId("scrubber-readout")).toBeTruthy();
    // "30" is warmth at snapshot index 0. It must appear in the readout.
    expect(getByText("30")).toBeTruthy();
    // The "now" label must NOT appear inside the readout for a historical point.
    // (The axis tick "now" outside the readout is fine to leave.)
    expect(
      within(getByTestId("scrubber-readout")).queryByText("now"),
    ).toBeNull();
  });

  it("shows updated trait values when panning to the 'now' endpoint", async () => {
    const { queryByTestId, getByTestId, getByText } = await renderAndWait();

    await act(async () => {
      mockPanBegin?.({ x: 0 });
    });

    // Move to the 'now' point
    await act(async () => {
      mockPanMove?.({ x: 999_999 });
    });

    expect(queryByTestId("scrubber-readout")).toBeTruthy();
    // Axis tick also says "now", scope to readout.
    expect(within(getByTestId("scrubber-readout")).getByText("now")).toBeTruthy();
    // SELF has warmth = 62 at the 'now' point.
    expect(getByText("62")).toBeTruthy();
  });
});

describe("GrowthTimeline scrubber — haptic feedback", () => {
  it("fires selectionAsync when the active index changes during a pan", async () => {
    await renderAndWait();

    // Pan begin at x=0 → snaps to index 0 (was null) — index changed, haptic fires.
    await act(async () => {
      mockPanBegin?.({ x: 0 });
    });

    expect(mockSelectionAsync).toHaveBeenCalledTimes(1);

    // Pan move to a very large x → snaps to index 2 (was 0) — index changed, haptic fires.
    await act(async () => {
      mockPanMove?.({ x: 999_999 });
    });

    expect(mockSelectionAsync).toHaveBeenCalledTimes(2);
  });

  it("does not fire selectionAsync when the pan stays over the same index", async () => {
    await renderAndWait();

    // Pan begin at x=0 → index 0.
    await act(async () => {
      mockPanBegin?.({ x: 0 });
    });
    expect(mockSelectionAsync).toHaveBeenCalledTimes(1);

    // Pan move by a tiny amount that still resolves to index 0.
    await act(async () => {
      mockPanMove?.({ x: 1 });
    });

    // Still just one call — no extra haptic for staying on the same point.
    expect(mockSelectionAsync).toHaveBeenCalledTimes(1);
  });
});

describe("GrowthTimeline scrubber — tap gesture", () => {
  it("shows the readout immediately after a tap", async () => {
    const { queryByTestId } = await renderAndWait();

    expect(queryByTestId("scrubber-readout")).toBeNull();

    jest.useFakeTimers();
    try {
      await act(async () => {
        mockTapEnd?.({ x: 0 });
      });

      expect(queryByTestId("scrubber-readout")).toBeTruthy();

      // Clean up the pending auto-dismiss timer.
      act(() => { jest.runAllTimers(); });
    } finally {
      jest.useRealTimers();
    }
  });

  it("auto-dismisses the readout 1.5 s after a tap", async () => {
    const { queryByTestId } = await renderAndWait();

    // Install fake timers AFTER the timeline has loaded so waitFor above
    // runs on real timers (avoiding polling issues) and only the auto-dismiss
    // setTimeout is faked.
    jest.useFakeTimers();
    try {
      await act(async () => {
        mockTapEnd?.({ x: 0 });
      });

      expect(queryByTestId("scrubber-readout")).toBeTruthy();

      // Advance past the 1 500 ms auto-dismiss delay.
      act(() => {
        jest.advanceTimersByTime(1600);
      });

      expect(queryByTestId("scrubber-readout")).toBeNull();
    } finally {
      jest.useRealTimers();
    }
  });

  it("tapping the 'now' x-position shows the 'now' label", async () => {
    const { queryByTestId, getByTestId } = await renderAndWait();

    jest.useFakeTimers();
    try {
      await act(async () => {
        mockTapEnd?.({ x: 999_999 });
      });

      expect(queryByTestId("scrubber-readout")).toBeTruthy();
      // The axis tick also shows "now"; scope the check to the readout.
      expect(
        within(getByTestId("scrubber-readout")).getByText("now"),
      ).toBeTruthy();

      // Clean up the auto-dismiss timer.
      act(() => { jest.runAllTimers(); });
    } finally {
      jest.useRealTimers();
    }
  });

  it("a pan begun during an active tap-dismiss cancels the auto-dismiss", async () => {
    const { queryByTestId } = await renderAndWait();

    jest.useFakeTimers();
    try {
      // Tap starts the 1.5 s timer
      await act(async () => {
        mockTapEnd?.({ x: 0 });
      });
      expect(queryByTestId("scrubber-readout")).toBeTruthy();

      // Pan begins before the timer fires — cancels the pending dismiss
      await act(async () => {
        mockPanBegin?.({ x: 50 });
      });

      // Advance past where the original timer would have fired
      act(() => {
        jest.advanceTimersByTime(2000);
      });

      // Readout must still be visible because the pan took over
      expect(queryByTestId("scrubber-readout")).toBeTruthy();

      // Pan ends — starts the 1200 ms pan linger.
      await act(async () => {
        mockPanEnd?.();
      });
      // Still visible during linger.
      expect(queryByTestId("scrubber-readout")).toBeTruthy();
      // Advance past linger.
      act(() => { jest.advanceTimersByTime(1300); });
      expect(queryByTestId("scrubber-readout")).toBeNull();
    } finally {
      jest.useRealTimers();
    }
  });
});
