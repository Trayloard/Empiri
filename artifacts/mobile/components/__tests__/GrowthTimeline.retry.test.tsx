import React from "react";
import { fireEvent, render } from "@testing-library/react-native";

import {
  getCompanionSelfHistory,
  type CompanionSelf,
  type CompanionSelfSnapshot,
} from "@workspace/api-client-react";

import { GrowthTimeline } from "../GrowthTimeline";

/**
 * Error-recovery tests for the Growth tab's snapshot-history fetch.
 *
 * The timeline shows a "Try again" pill when loading the snapshot history
 * fails; pressing it must re-run the fetch in place and, once it succeeds,
 * render the timeline content. These tests lock in that recovery path so a
 * refactor can't silently break it.
 */

jest.mock("@expo/vector-icons", () => ({
  Feather: () => null,
}));

jest.mock("react-native-svg", () => {
  const { View } = require("react-native");
  return { __esModule: true, default: View, Path: View, Circle: View, Line: View };
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
    withRepeat: (v: unknown) => v,
    runOnJS: (fn: (...args: unknown[]) => void) => fn,
    Easing: {
      inOut: () => () => 0,
      out: () => () => 0,
      cubic: () => 0,
      ease: () => 0,
    },
  };
});

jest.mock("react-native-gesture-handler", () => {
  const { View } = require("react-native");
  const Gesture = {
    Tap: () => ({ onEnd: () => Gesture.Tap() }),
    Pan: () => ({
      minDistance: () => Gesture.Pan(),
      onBegin: () => Gesture.Pan(),
      onUpdate: () => Gesture.Pan(),
      onEnd: () => Gesture.Pan(),
      onFinalize: () => Gesture.Pan(),
    }),
    Race: (..._args: unknown[]) => ({}),
  };
  return {
    Gesture,
    GestureDetector: ({ children }: { children: React.ReactNode }) => children,
  };
});

// Shared manual mock: see artifacts/mobile/__mocks__/@workspace/api-client-react.ts
jest.mock("@workspace/api-client-react");

const mockGetHistory = getCompanionSelfHistory as jest.MockedFunction<
  typeof getCompanionSelfHistory
>;

const SELF: CompanionSelf = {
  drives: [{ key: "connection", level: 40, striving: 55 }],
  traits: [{ key: "warmth", value: 62 }],
  interests: [{ topic: "stars", display: "Stars", affinity: 48 }],
  narrative: ["I light up when you talk about the night sky."],
  facts: [],
  chapters: [],
  interactions: 12,
  ageHours: 30,
  themes: null,
};

const SNAPSHOTS: CompanionSelfSnapshot[] = [
  {
    capturedAt: "2026-07-10T12:00:00.000Z",
    interactions: 4,
    drives: [{ key: "connection", level: 30, striving: 50 }],
    traits: [{ key: "warmth", value: 40 }],
    interests: [],
  },
  {
    capturedAt: "2026-07-15T12:00:00.000Z",
    interactions: 9,
    drives: [{ key: "connection", level: 38, striving: 52 }],
    traits: [{ key: "warmth", value: 55 }],
    interests: [{ topic: "stars", display: "Stars", affinity: 30 }],
  },
];

afterEach(() => {
  jest.clearAllMocks();
});

describe("GrowthTimeline retry", () => {
  it("shows the error state with a retry button when the history fetch fails", async () => {
    mockGetHistory.mockRejectedValueOnce(new Error("network down"));

    const { findByTestId, queryByTestId } = render(
      <GrowthTimeline conversationId={1} self={SELF} bottomInset={0} />,
    );

    expect(await findByTestId("retry-growth")).toBeTruthy();
    expect(queryByTestId("growth-timeline")).toBeNull();
    expect(mockGetHistory).toHaveBeenCalledTimes(1);
  });

  it("re-runs the fetch on Try again and renders content after it succeeds", async () => {
    mockGetHistory
      .mockRejectedValueOnce(new Error("network down"))
      .mockResolvedValueOnce({ snapshots: SNAPSHOTS });

    const { findByTestId, queryByTestId } = render(
      <GrowthTimeline conversationId={1} self={SELF} bottomInset={0} />,
    );

    fireEvent.press(await findByTestId("retry-growth"));

    expect(await findByTestId("growth-timeline")).toBeTruthy();
    expect(queryByTestId("retry-growth")).toBeNull();
    expect(mockGetHistory).toHaveBeenCalledTimes(2);
  });

  it("keeps showing the error state (with the button) when the retry fails too", async () => {
    mockGetHistory
      .mockRejectedValueOnce(new Error("network down"))
      .mockRejectedValueOnce(new Error("still down"));

    const { findByTestId, queryByTestId } = render(
      <GrowthTimeline conversationId={1} self={SELF} bottomInset={0} />,
    );

    fireEvent.press(await findByTestId("retry-growth"));

    expect(await findByTestId("retry-growth")).toBeTruthy();
    expect(queryByTestId("growth-timeline")).toBeNull();
    expect(mockGetHistory).toHaveBeenCalledTimes(2);
  });
});
