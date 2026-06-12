import React from "react";
import { fireEvent, render } from "@testing-library/react-native";

import { CheckInSettingsSheet } from "../CheckInSettingsSheet";

/**
 * Render-level safety tests for the dev-tools section of CheckInSettingsSheet.
 *
 * The hard requirement of the dev-shortcut work is that the "Check in now" /
 * "Nudge in 5s" buttons NEVER reach real users. These tests lock in two things:
 *
 * 1. The dev section renders when `__DEV__` is true (its inputs are wired and
 *    pressing the buttons calls the right callbacks).
 * 2. The dev section is completely absent when `__DEV__` is false (simulating a
 *    production build where Metro dead-code-eliminates it).
 *
 * `__DEV__` is a runtime global in jest-expo (not inlined at compile time), so
 * toggling it within a test accurately reflects what React evaluates at render.
 */

jest.mock("@expo/vector-icons", () => ({
  Feather: () => null,
}));

jest.mock("expo-haptics", () => ({
  selectionAsync: jest.fn().mockResolvedValue(undefined),
  impactAsync: jest.fn().mockResolvedValue(undefined),
  ImpactFeedbackStyle: { Light: "light" },
}));

jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ bottom: 0, top: 0, left: 0, right: 0 }),
}));

jest.mock("@/constants/fonts", () => ({
  FONTS: {
    regular: "regular",
    medium: "medium",
    semibold: "semibold",
    bold: "bold",
    extrabold: "extrabold",
  },
}));

jest.mock("@/hooks/useColors", () => ({
  useColors: () => ({
    background: "#fff",
    foreground: "#000",
    foregroundSecondary: "#333",
    mutedForeground: "#888",
    muted: "#f0f0f0",
    border: "#e0e0e0",
    glassBorder: "#ddd",
    statusAccent: "#7C3AED",
    card: "#fff",
  }),
}));

jest.mock("@/lib/notifications", () => ({
  DEV_NUDGE_SECONDS: 5,
  scheduleNudgeInSeconds: jest.fn(),
}));

const defaultProps = {
  visible: true,
  cadence: "daily" as const,
  onSelect: jest.fn(),
  onClose: jest.fn(),
};

afterEach(() => {
  // Restore __DEV__ in case a test flipped it to false.
  (global as any).__DEV__ = true;
  jest.clearAllMocks();
});

describe("CheckInSettingsSheet dev tools section", () => {
  it("renders the dev section with both buttons when __DEV__ is true", () => {
    // __DEV__ defaults to true in jest-expo — no toggle needed.
    const { getByTestId } = render(
      <CheckInSettingsSheet
        {...defaultProps}
        onDevCheckIn={jest.fn()}
        onDevNudge={jest.fn()}
      />,
    );

    expect(getByTestId("dev-tools-section")).toBeTruthy();
    expect(getByTestId("dev-trigger-checkin")).toBeTruthy();
    expect(getByTestId("dev-trigger-nudge")).toBeTruthy();
  });

  it("calls onDevCheckIn when the 'Check in now' button is pressed", () => {
    const mockCheckIn = jest.fn();
    const { getByTestId } = render(
      <CheckInSettingsSheet
        {...defaultProps}
        onDevCheckIn={mockCheckIn}
        onDevNudge={jest.fn()}
      />,
    );

    fireEvent.press(getByTestId("dev-trigger-checkin"));
    expect(mockCheckIn).toHaveBeenCalledTimes(1);
  });

  it("calls onDevNudge when the 'Nudge' button is pressed", () => {
    const mockNudge = jest.fn();
    const { getByTestId } = render(
      <CheckInSettingsSheet
        {...defaultProps}
        onDevCheckIn={jest.fn()}
        onDevNudge={mockNudge}
      />,
    );

    fireEvent.press(getByTestId("dev-trigger-nudge"));
    expect(mockNudge).toHaveBeenCalledTimes(1);
  });

  it("does NOT render the dev section when __DEV__ is false (simulates production)", () => {
    // Switch the global off before rendering — React evaluates it at render time,
    // so this accurately mirrors the Metro dead-code-elimination in release builds.
    (global as any).__DEV__ = false;

    const { queryByTestId } = render(
      <CheckInSettingsSheet
        {...defaultProps}
        onDevCheckIn={jest.fn()}
        onDevNudge={jest.fn()}
      />,
    );

    expect(queryByTestId("dev-tools-section")).toBeNull();
    expect(queryByTestId("dev-trigger-checkin")).toBeNull();
    expect(queryByTestId("dev-trigger-nudge")).toBeNull();
  });
});
