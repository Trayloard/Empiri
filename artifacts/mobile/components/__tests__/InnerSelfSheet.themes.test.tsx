import React from "react";
import { fireEvent, render } from "@testing-library/react-native";

import {
  getCompanionMemory,
  getCompanionSelf,
  type CompanionSelf,
} from "@workspace/api-client-react";

import { InnerSelfSheet } from "../InnerSelfSheet";

/**
 * Layout-safety tests for curiosity-theme expansion on the mind map.
 *
 * Tapping a theme node expands it inline into its member curiosities,
 * rebuilding the whole graph. These tests lock in that the rebuild never
 * scrambles the map:
 *
 * - theme nodes toggle their members open/closed (no detail card)
 * - member nodes open the bottom detail card like any other leaf
 * - collapsed themes never leak members; independent themes don't interfere
 * - node ids stay unique so wires/keys can't cross
 * - non-theme nodes (drives, traits, single curiosities) behave exactly
 *   as before
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

// Two independent themes (Space ×3, Cooking ×2) plus one standalone curiosity.
const SELF: CompanionSelf = {
  drives: [{ key: "connection", level: 40, striving: 55 }],
  traits: [{ key: "warmth", value: 62 }],
  interests: [
    { topic: "galaxies", display: "Galaxies", affinity: 70 },
    { topic: "hiking", display: "Hiking", affinity: 33 },
    { topic: "astrophysics", display: "Astrophysics", affinity: 55 },
    { topic: "stars", display: "Stars", affinity: 80 },
    { topic: "baking", display: "Baking", affinity: 44 },
    { topic: "sourdough", display: "Sourdough", affinity: 61 },
  ],
  narrative: ["I light up when you talk about the night sky."],
  facts: [],
  chapters: [],
  interactions: 12,
  ageHours: 30,
  themes: {
    galaxies: "Space",
    astrophysics: "Space",
    stars: "Space",
    baking: "Cooking",
    sourdough: "Cooking",
  },
};

const defaultProps = {
  visible: true,
  conversationId: 1,
  onClose: jest.fn(),
};

async function renderSheet() {
  mockGetSelf.mockResolvedValue(SELF);
  mockGetMemory.mockResolvedValue({ summary: null });
  const utils = render(<InnerSelfSheet {...defaultProps} />);
  // Wait for the mind map to appear.
  await utils.findByTestId("node-you");
  return utils;
}

afterEach(() => {
  jest.clearAllMocks();
});

// The first render in the suite pays the full module-compilation cost, which
// can exceed jest's default 5s timeout on slower machines.
jest.setTimeout(20000);

describe("InnerSelfSheet curiosity-theme expansion", () => {
  it("renders theme nodes collapsed with no member nodes leaking", async () => {
    const { getByTestId, queryByTestId } = await renderSheet();

    expect(getByTestId("node-interest-theme-space")).toBeTruthy();
    expect(getByTestId("node-interest-theme-cooking")).toBeTruthy();
    expect(queryByTestId("node-interest-theme-space-m0")).toBeNull();
    expect(queryByTestId("node-interest-theme-cooking-m0")).toBeNull();
  });

  it("expands a theme into its members on tap, and collapses it again on a second tap", async () => {
    const { getByTestId, queryByTestId } = await renderSheet();

    fireEvent.press(getByTestId("node-interest-theme-space"));

    // Space has 3 members; sorted by affinity: Stars, Galaxies, Astrophysics.
    expect(getByTestId("node-interest-theme-space-m0")).toBeTruthy();
    expect(getByTestId("node-interest-theme-space-m1")).toBeTruthy();
    expect(getByTestId("node-interest-theme-space-m2")).toBeTruthy();
    expect(queryByTestId("node-interest-theme-space-m3")).toBeNull();
    // The other theme stays collapsed — no cross-theme leakage.
    expect(queryByTestId("node-interest-theme-cooking-m0")).toBeNull();

    fireEvent.press(getByTestId("node-interest-theme-space"));
    expect(queryByTestId("node-interest-theme-space-m0")).toBeNull();
    expect(queryByTestId("node-interest-theme-space-m1")).toBeNull();
    expect(queryByTestId("node-interest-theme-space-m2")).toBeNull();
  });

  it("tapping a theme node toggles instead of opening the detail card", async () => {
    const { getByTestId, queryByTestId } = await renderSheet();

    fireEvent.press(getByTestId("node-interest-theme-space"));
    expect(queryByTestId("node-detail")).toBeNull();

    fireEvent.press(getByTestId("node-interest-theme-space"));
    expect(queryByTestId("node-detail")).toBeNull();
  });

  it("member nodes open the bottom detail card", async () => {
    const { getByTestId, getByText } = await renderSheet();

    fireEvent.press(getByTestId("node-interest-theme-space"));
    // m0 = highest affinity member of Space = Stars (80).
    fireEvent.press(getByTestId("node-interest-theme-space-m0"));

    expect(getByTestId("node-detail")).toBeTruthy();
    expect(getByText("Stars")).toBeTruthy();
    expect(getByText("Curiosity · part of Space")).toBeTruthy();
  });

  it("keeps two themes expanded independently without duplicate ids", async () => {
    const { getByTestId, getAllByTestId } = await renderSheet();

    fireEvent.press(getByTestId("node-interest-theme-space"));
    fireEvent.press(getByTestId("node-interest-theme-cooking"));

    // Both themes expanded at once; each member id appears exactly once.
    for (const id of [
      "node-interest-theme-space",
      "node-interest-theme-space-m0",
      "node-interest-theme-space-m1",
      "node-interest-theme-space-m2",
      "node-interest-theme-cooking",
      "node-interest-theme-cooking-m0",
      "node-interest-theme-cooking-m1",
    ]) {
      expect(getAllByTestId(id)).toHaveLength(1);
    }
  });

  it("collapsing one theme leaves the other theme's members visible", async () => {
    const { getByTestId, queryByTestId } = await renderSheet();

    fireEvent.press(getByTestId("node-interest-theme-space"));
    fireEvent.press(getByTestId("node-interest-theme-cooking"));
    fireEvent.press(getByTestId("node-interest-theme-space"));

    expect(queryByTestId("node-interest-theme-space-m0")).toBeNull();
    expect(getByTestId("node-interest-theme-cooking-m0")).toBeTruthy();
    expect(getByTestId("node-interest-theme-cooking-m1")).toBeTruthy();
  });

  it("leaves non-theme behavior unchanged: drives, traits and single curiosities open the detail card", async () => {
    const { getByTestId, getByText, queryByTestId } = await renderSheet();

    fireEvent.press(getByTestId("node-drive-connection"));
    expect(getByTestId("node-detail")).toBeTruthy();
    expect(getByText("Connection")).toBeTruthy();
    fireEvent.press(getByTestId("detail-backdrop"));
    expect(queryByTestId("node-detail")).toBeNull();

    fireEvent.press(getByTestId("node-trait-warmth"));
    expect(getByTestId("node-detail")).toBeTruthy();
    expect(getByText("Warmth")).toBeTruthy();
    fireEvent.press(getByTestId("detail-backdrop"));

    // "hiking" is the only ungrouped interest — index 1 in the original list.
    fireEvent.press(getByTestId("node-interest-1"));
    expect(getByTestId("node-detail")).toBeTruthy();
    expect(getByText("Hiking")).toBeTruthy();
  });
});
