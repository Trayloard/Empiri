import React from "react";
import { act, fireEvent, render, screen } from "@testing-library/react-native";

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

// Shared manual mock: see artifacts/mobile/__mocks__/@workspace/api-client-react.ts
jest.mock("@workspace/api-client-react");

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

  it("theme node starts with accessibilityState expanded=false and flips to true on tap", async () => {
    const { getByTestId } = await renderSheet();

    const themeNode = getByTestId("node-interest-theme-space");
    expect(themeNode.props.accessibilityState).toEqual({ expanded: false });
    expect(themeNode.props.accessibilityLabel).toBe("Space theme, collapsed");

    fireEvent.press(themeNode);

    const expanded = getByTestId("node-interest-theme-space");
    expect(expanded.props.accessibilityState).toEqual({ expanded: true });
    expect(expanded.props.accessibilityLabel).toBe("Space theme, expanded");
  });

  it("theme nodes announce their member count in the accessibility hint", async () => {
    const { getByTestId } = await renderSheet();

    // Space holds 3 curiosities, Cooking holds 2.
    expect(getByTestId("node-interest-theme-space").props.accessibilityHint).toBe(
      "Contains 3 curiosities, double tap to open",
    );
    expect(getByTestId("node-interest-theme-cooking").props.accessibilityHint).toBe(
      "Contains 2 curiosities, double tap to open",
    );

    // Expanding flips the action wording while keeping the count.
    fireEvent.press(getByTestId("node-interest-theme-space"));
    expect(getByTestId("node-interest-theme-space").props.accessibilityHint).toBe(
      "Contains 3 curiosities, double tap to close",
    );
  });

  it("non-theme nodes carry no accessibility hint", async () => {
    const { getByTestId } = await renderSheet();

    expect(getByTestId("node-drive-connection").props.accessibilityHint).toBeUndefined();
    expect(getByTestId("node-interest-1").props.accessibilityHint).toBeUndefined();
  });

  it("non-theme nodes carry no expanded accessibilityState", async () => {
    const { getByTestId } = await renderSheet();

    const driveNode = getByTestId("node-drive-connection");
    // RNTL normalises accessibilityState to a full object; check the specific
    // field rather than the whole prop, which is never undefined.
    expect(driveNode.props.accessibilityState?.expanded).toBeUndefined();
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

/**
 * Background theme refresh tests.
 *
 * When the server returns `themes: null` on the initial load (no cache yet),
 * the sheet renders immediately using the heuristic fallback grouping and then
 * silently re-fetches after a delay to pick up the freshly-computed themes.
 * Uses fake timers to control the polling delays without real waits.
 */
describe("InnerSelfSheet background theme refresh", () => {
  const SELF_NO_THEMES: CompanionSelf = {
    drives: [{ key: "connection", level: 40, striving: 55 }],
    traits: [{ key: "warmth", value: 62 }],
    interests: [
      { topic: "galaxies", display: "Galaxies", affinity: 70 },
      { topic: "astrophysics", display: "Astrophysics", affinity: 55 },
      { topic: "stars", display: "Stars", affinity: 80 },
    ],
    narrative: [],
    facts: [],
    chapters: [],
    interactions: 5,
    ageHours: 2,
    themes: null,
  };

  const SELF_WITH_THEMES: CompanionSelf = {
    ...SELF_NO_THEMES,
    themes: {
      galaxies: "Space",
      astrophysics: "Space",
      stars: "Space",
    },
  };

  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
    jest.clearAllMocks();
  });

  it("renders the map immediately with null themes and silently applies fresh themes after the first background poll", async () => {
    // Initial load: no cached themes yet (server is computing in background).
    // Background polls: first returns null (still computing), second returns
    // fresh themes — verifying the poll-until-success chain works.
    mockGetSelf
      .mockResolvedValueOnce(SELF_NO_THEMES)
      .mockResolvedValueOnce(SELF_NO_THEMES)
      .mockResolvedValueOnce(SELF_WITH_THEMES);
    mockGetMemory.mockResolvedValue({ summary: null });

    const { findByTestId, queryByTestId } = render(
      <InnerSelfSheet {...defaultProps} />,
    );

    // Map appears immediately — theme grouping never blocks the initial render.
    expect(await findByTestId("node-you")).toBeTruthy();
    // With themes=null, individual interest nodes are shown (heuristic can't
    // group across unrelated roots like "galaxies", "astrophysics", "stars"),
    // and the server-driven Space theme node does not exist yet.
    expect(queryByTestId("node-interest-theme-space")).toBeNull();
    expect(findByTestId("node-interest-0")).toBeTruthy();

    // First background poll fires after the 2 s delay — server still computing,
    // themes still null; the poll schedules the next attempt automatically.
    await act(async () => { jest.advanceTimersByTime(2001); });
    expect(queryByTestId("node-interest-theme-space")).toBeNull();

    // Second background poll fires after the 4 s delay — themes are now ready.
    await act(async () => { jest.advanceTimersByTime(4001); });

    // Themes applied silently: the Space group node now exists.
    expect(await findByTestId("node-interest-theme-space")).toBeTruthy();
    // Exactly three calls: initial + two background polls.
    expect(mockGetSelf).toHaveBeenCalledTimes(3);
  });

  it("stops polling as soon as the first poll returns non-null themes", async () => {
    // First poll already returns themes — only two total calls expected.
    mockGetSelf
      .mockResolvedValueOnce(SELF_NO_THEMES)
      .mockResolvedValueOnce(SELF_WITH_THEMES);
    mockGetMemory.mockResolvedValue({ summary: null });

    const { findByTestId } = render(<InnerSelfSheet {...defaultProps} />);
    expect(await findByTestId("node-you")).toBeTruthy();

    // Fire the first (and only) background poll.
    await act(async () => { jest.advanceTimersByTime(2001); });

    // Themes applied; poll chain stopped — the call count is exactly 2.
    expect(await findByTestId("node-interest-theme-space")).toBeTruthy();
    expect(mockGetSelf).toHaveBeenCalledTimes(2);
  });

  it("falls back to heuristic grouping when all three polls are exhausted with themes still null", async () => {
    // LLM is down / slow — every call returns themes: null throughout the
    // entire poll budget (initial + 3 background polls = 4 total calls).
    mockGetSelf.mockResolvedValue(SELF_NO_THEMES);
    mockGetMemory.mockResolvedValue({ summary: null });

    const { findByTestId, queryByTestId } = render(
      <InnerSelfSheet {...defaultProps} />,
    );

    // Map appears immediately with heuristic grouping (no theme nodes).
    expect(await findByTestId("node-you")).toBeTruthy();
    expect(queryByTestId("node-interest-theme-space")).toBeNull();
    // All three interests render as individual curiosity nodes.
    expect(await findByTestId("node-interest-0")).toBeTruthy();
    expect(await findByTestId("node-interest-1")).toBeTruthy();
    expect(await findByTestId("node-interest-2")).toBeTruthy();

    // Advance through all three poll delays: 2 s, 4 s, 6 s.
    await act(async () => { jest.advanceTimersByTime(2001); });
    await act(async () => { jest.advanceTimersByTime(4001); });
    await act(async () => { jest.advanceTimersByTime(6001); });

    // After budget exhausted, the map still shows heuristic grouping —
    // no theme node appeared and all three individual nodes remain.
    expect(queryByTestId("node-interest-theme-space")).toBeNull();
    expect(await findByTestId("node-interest-0")).toBeTruthy();
    expect(await findByTestId("node-interest-1")).toBeTruthy();
    expect(await findByTestId("node-interest-2")).toBeTruthy();
    // Exactly four calls: initial load + three background polls.
    expect(mockGetSelf).toHaveBeenCalledTimes(4);
  });

  it("replaces stale non-null cached themes once the server finishes recomputing", async () => {
    // Stale cache: galaxies and stars grouped under Space, but astrophysics is
    // missing (the server received the new interest set and is recomputing).
    const STALE: CompanionSelf = {
      ...SELF_NO_THEMES,
      themes: { galaxies: "Space", stars: "Space" },
    };
    // Fresh themes after server recompute includes astrophysics in the group.
    const FRESH: CompanionSelf = {
      ...SELF_NO_THEMES,
      themes: { galaxies: "Space", stars: "Space", astrophysics: "Space" },
    };

    // Initial load and first poll both return stale themes;
    // second poll returns freshly computed themes.
    mockGetSelf
      .mockResolvedValueOnce(STALE)
      .mockResolvedValueOnce(STALE)
      .mockResolvedValueOnce(FRESH);
    mockGetMemory.mockResolvedValue({ summary: null });

    const { findByTestId, queryByTestId } = render(
      <InnerSelfSheet {...defaultProps} />,
    );

    // Map renders immediately with stale grouping — Space theme is present
    // (galaxies + stars), but astrophysics is not yet a member of any theme;
    // it appears as an individual node at its original array index (1).
    expect(await findByTestId("node-you")).toBeTruthy();
    expect(queryByTestId("node-interest-theme-space")).toBeTruthy();
    expect(queryByTestId("node-interest-1")).toBeTruthy();

    // First poll fires (2 s) — still stale, poll continues.
    await act(async () => { jest.advanceTimersByTime(2001); });
    expect(queryByTestId("node-interest-theme-space")).toBeTruthy();
    expect(queryByTestId("node-interest-1")).toBeTruthy();

    // Second poll fires (4 s more) — fresh themes arrive.
    await act(async () => { jest.advanceTimersByTime(4001); });

    // After the recompute, astrophysics is part of the Space theme:
    // individual astrophysics node is gone, Space theme node remains.
    expect(await findByTestId("node-interest-theme-space")).toBeTruthy();
    expect(queryByTestId("node-interest-1")).toBeNull();
    expect(mockGetSelf).toHaveBeenCalledTimes(3);
  });
});
