import React from "react";
import { fireEvent, render } from "@testing-library/react-native";

import {
  getCompanionMemory,
  getCompanionSelf,
  type CompanionSelf,
} from "@workspace/api-client-react";

import { InnerSelfSheet } from "../InnerSelfSheet";

/**
 * Error-recovery tests for the inner-self sheet's Mind and Memory tabs.
 *
 * Both tabs show a "Try again" pill when their fetch fails; pressing it must
 * re-run the failed fetch in place (without closing the sheet) and render the
 * tab's content once it succeeds. These tests lock in that recovery path so a
 * refactor can't silently break it.
 */

jest.mock("@expo/vector-icons", () => ({
  Feather: () => null,
}));

jest.mock("expo-haptics", () => ({
  selectionAsync: jest.fn().mockResolvedValue(undefined),
  impactAsync: jest.fn().mockResolvedValue(undefined),
  notificationAsync: jest.fn().mockResolvedValue(undefined),
  ImpactFeedbackStyle: { Light: "light" },
  NotificationFeedbackType: { Success: "success" },
}));

jest.mock("expo-linear-gradient", () => {
  const { View } = require("react-native");
  return { LinearGradient: View };
});

jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ bottom: 0, top: 0, left: 0, right: 0 }),
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
  const React = require("react");
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

// Fully mock the data client so we can drive success/failure deterministically.
jest.mock("@workspace/api-client-react", () => ({
  clearCompanionMemory: jest.fn(),
  getCompanionMemory: jest.fn(),
  getCompanionSelf: jest.fn(),
  getCompanionSelfHistory: jest.fn(),
  updateCompanionMemory: jest.fn(),
}));

const mockGetSelf = getCompanionSelf as jest.MockedFunction<
  typeof getCompanionSelf
>;
const mockGetMemory = getCompanionMemory as jest.MockedFunction<
  typeof getCompanionMemory
>;

// NOTE: `facts: []` is load-bearing — the Memory tab's error state only
// renders while there are no facts (`memoryError && facts.length === 0`).
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

const defaultProps = {
  visible: true,
  conversationId: 1,
  onClose: jest.fn(),
};

afterEach(() => {
  jest.clearAllMocks();
});

describe("InnerSelfSheet Mind tab retry", () => {
  it("shows the error state with a retry button when the self fetch fails", async () => {
    mockGetSelf.mockRejectedValueOnce(new Error("network down"));
    mockGetMemory.mockResolvedValue({ summary: null });

    const { findByTestId, queryByTestId } = render(
      <InnerSelfSheet {...defaultProps} />,
    );

    expect(await findByTestId("retry-self")).toBeTruthy();
    expect(queryByTestId("node-you")).toBeNull();
    expect(mockGetSelf).toHaveBeenCalledTimes(1);
  });

  it("re-runs the self fetch on Try again and renders the mind map after it succeeds", async () => {
    mockGetSelf
      .mockRejectedValueOnce(new Error("network down"))
      .mockResolvedValueOnce(SELF);
    mockGetMemory.mockResolvedValue({ summary: null });

    const { findByTestId, queryByTestId } = render(
      <InnerSelfSheet {...defaultProps} />,
    );

    fireEvent.press(await findByTestId("retry-self"));

    expect(await findByTestId("node-you")).toBeTruthy();
    expect(queryByTestId("retry-self")).toBeNull();
    expect(mockGetSelf).toHaveBeenCalledTimes(2);
  });

  it("keeps showing the retry button when the retry fails too", async () => {
    mockGetSelf
      .mockRejectedValueOnce(new Error("network down"))
      .mockRejectedValueOnce(new Error("still down"));
    mockGetMemory.mockResolvedValue({ summary: null });

    const { findByTestId, queryByTestId } = render(
      <InnerSelfSheet {...defaultProps} />,
    );

    fireEvent.press(await findByTestId("retry-self"));

    expect(await findByTestId("retry-self")).toBeTruthy();
    expect(queryByTestId("node-you")).toBeNull();
    expect(mockGetSelf).toHaveBeenCalledTimes(2);
  });
});

describe("InnerSelfSheet Memory tab retry", () => {
  it("shows the error state with a retry button when the memory fetch fails", async () => {
    mockGetSelf.mockResolvedValue(SELF);
    mockGetMemory.mockRejectedValueOnce(new Error("network down"));

    const { findByTestId } = render(<InnerSelfSheet {...defaultProps} />);

    // The memory fetch runs alongside the self fetch; switch to the tab to
    // see its error state.
    fireEvent.press(await findByTestId("mode-memory"));

    expect(await findByTestId("retry-memory")).toBeTruthy();
    expect(mockGetMemory).toHaveBeenCalledTimes(1);
  });

  it("re-runs the memory fetch on Try again and renders the memory after it succeeds", async () => {
    mockGetSelf.mockResolvedValue(SELF);
    mockGetMemory
      .mockRejectedValueOnce(new Error("network down"))
      .mockResolvedValueOnce({ summary: "We talked about the stars." });

    const { findByTestId, findByText, queryByTestId } = render(
      <InnerSelfSheet {...defaultProps} />,
    );

    fireEvent.press(await findByTestId("mode-memory"));
    fireEvent.press(await findByTestId("retry-memory"));

    expect(await findByText("We talked about the stars.")).toBeTruthy();
    expect(queryByTestId("retry-memory")).toBeNull();
    expect(mockGetMemory).toHaveBeenCalledTimes(2);
  });

  it("keeps showing the retry button when the retry fails too", async () => {
    mockGetSelf.mockResolvedValue(SELF);
    mockGetMemory
      .mockRejectedValueOnce(new Error("network down"))
      .mockRejectedValueOnce(new Error("still down"));

    const { findByTestId } = render(<InnerSelfSheet {...defaultProps} />);

    fireEvent.press(await findByTestId("mode-memory"));
    fireEvent.press(await findByTestId("retry-memory"));

    expect(await findByTestId("retry-memory")).toBeTruthy();
    expect(mockGetMemory).toHaveBeenCalledTimes(2);
  });
});
