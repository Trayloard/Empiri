import React from "react";
import { ActivityIndicator } from "react-native";
import { fireEvent, render, waitFor } from "@testing-library/react-native";

import {
  clearCompanionMemory,
  getCompanionMemory,
  getCompanionSelf,
  updateCompanionMemory,
  type CompanionSelf,
} from "@workspace/api-client-react";

import { InnerSelfSheet } from "../InnerSelfSheet";

/**
 * Tests for the Memory tab's edit / forget flows.
 *
 * Users can correct the rolling memory inline (Edit → Save/Cancel) and clear
 * it entirely behind an inline confirm (Forget → Keep/Forget). Both actions
 * surface an error message when the request fails, and an empty draft is
 * rejected locally without a request. These tests lock in every branch.
 */

// The first render of the full sheet in a fresh suite can exceed jest's 5s
// default while modules warm up under jest-expo.
jest.setTimeout(15000);

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
  return { __esModule: true, default: View, Path: View, Circle: View };
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
    Easing: {
      inOut: () => () => 0,
      out: () => () => 0,
      cubic: () => 0,
      ease: () => 0,
    },
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
const mockUpdateMemory = updateCompanionMemory as jest.MockedFunction<
  typeof updateCompanionMemory
>;
const mockClearMemory = clearCompanionMemory as jest.MockedFunction<
  typeof clearCompanionMemory
>;

// NOTE: `facts: []` keeps the Memory tab's states unambiguous — with facts
// present, the empty/error branches render differently.
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

const MEMORY = "We talked about the stars.";

const defaultProps = {
  visible: true,
  conversationId: 1,
  onClose: jest.fn(),
};

/** A promise whose resolution the test controls, to hold a request in flight. */
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

/** Render the sheet, switch to the Memory tab, and wait for the memory. */
async function openMemoryTab() {
  const utils = render(<InnerSelfSheet {...defaultProps} />);
  fireEvent.press(await utils.findByTestId("mode-memory"));
  await utils.findByTestId("memory-text");
  return utils;
}

beforeEach(() => {
  mockGetSelf.mockResolvedValue(SELF);
  mockGetMemory.mockResolvedValue({ summary: MEMORY });
});

afterEach(() => {
  jest.clearAllMocks();
});

describe("InnerSelfSheet memory editing", () => {
  it("opens the editor prefilled and saves the corrected memory", async () => {
    mockUpdateMemory.mockResolvedValue({
      summary: "We talked about the moon.",
    });
    const { findByTestId, findByText, getByTestId, queryByTestId } =
      await openMemoryTab();

    fireEvent.press(getByTestId("memory-edit"));
    const input = await findByTestId("memory-edit-input");
    expect(input.props.value).toBe(MEMORY);

    fireEvent.changeText(input, "  We talked about the moon.  ");
    fireEvent.press(getByTestId("memory-edit-save"));

    expect(await findByText("We talked about the moon.")).toBeTruthy();
    expect(queryByTestId("memory-edit-input")).toBeNull();
    expect(mockUpdateMemory).toHaveBeenCalledTimes(1);
    expect(mockUpdateMemory).toHaveBeenCalledWith(1, {
      summary: "We talked about the moon.",
    });
  });

  it("shows a save error and stays in edit mode when saving fails", async () => {
    mockUpdateMemory.mockRejectedValue(new Error("network down"));
    const { findByTestId, findByText, getByTestId } = await openMemoryTab();

    fireEvent.press(getByTestId("memory-edit"));
    const input = await findByTestId("memory-edit-input");
    fireEvent.changeText(input, "Something new");
    fireEvent.press(getByTestId("memory-edit-save"));

    expect(
      await findByText("Couldn't save just now. Please try again."),
    ).toBeTruthy();
    expect(getByTestId("memory-edit-input")).toBeTruthy();
    expect(mockUpdateMemory).toHaveBeenCalledTimes(1);
  });

  it("rejects an empty draft locally without calling the API", async () => {
    const { findByTestId, findByText, getByTestId } = await openMemoryTab();

    fireEvent.press(getByTestId("memory-edit"));
    const input = await findByTestId("memory-edit-input");
    fireEvent.changeText(input, "   ");
    fireEvent.press(getByTestId("memory-edit-save"));

    expect(
      await findByText("The memory can't be empty — use Forget instead."),
    ).toBeTruthy();
    expect(getByTestId("memory-edit-input")).toBeTruthy();
    expect(mockUpdateMemory).not.toHaveBeenCalled();
  });

  it("cancels editing without saving and keeps the original memory", async () => {
    const { findByTestId, getByTestId, getByText, queryByTestId } =
      await openMemoryTab();

    fireEvent.press(getByTestId("memory-edit"));
    const input = await findByTestId("memory-edit-input");
    fireEvent.changeText(input, "A change I abandon");
    fireEvent.press(getByTestId("memory-edit-cancel"));

    await waitFor(() => {
      expect(queryByTestId("memory-edit-input")).toBeNull();
    });
    expect(getByText(MEMORY)).toBeTruthy();
    expect(mockUpdateMemory).not.toHaveBeenCalled();
  });
});

describe("InnerSelfSheet memory forgetting", () => {
  it("asks for confirmation before forgetting, then clears the memory", async () => {
    mockClearMemory.mockResolvedValue(undefined as never);
    const { findByTestId, findByText, getByTestId, getByText, queryByTestId } =
      await openMemoryTab();

    // Forget is a two-step action: the request only fires after the inline
    // confirm.
    fireEvent.press(getByTestId("memory-clear"));
    expect(getByText("Forget all of this?")).toBeTruthy();
    expect(mockClearMemory).not.toHaveBeenCalled();

    fireEvent.press(await findByTestId("memory-clear-confirm"));

    expect(await findByText(/Nothing to remember yet/)).toBeTruthy();
    expect(queryByTestId("memory-text")).toBeNull();
    expect(mockClearMemory).toHaveBeenCalledTimes(1);
    expect(mockClearMemory).toHaveBeenCalledWith(1);
  });

  it("keeps the memory when the confirm is dismissed", async () => {
    const { findByTestId, getByTestId, getByText, queryByTestId } =
      await openMemoryTab();

    fireEvent.press(getByTestId("memory-clear"));
    fireEvent.press(await findByTestId("memory-clear-cancel"));

    await waitFor(() => {
      expect(queryByTestId("memory-clear-confirm")).toBeNull();
    });
    expect(getByText(MEMORY)).toBeTruthy();
    expect(mockClearMemory).not.toHaveBeenCalled();
  });

  it("shows a forget error and keeps the memory when clearing fails", async () => {
    mockClearMemory.mockRejectedValue(new Error("network down"));
    const { findByTestId, findByText, getByTestId } = await openMemoryTab();

    fireEvent.press(getByTestId("memory-clear"));
    fireEvent.press(await findByTestId("memory-clear-confirm"));

    expect(
      await findByText("Couldn't forget just now. Please try again."),
    ).toBeTruthy();
    expect(getByTestId("memory-text")).toBeTruthy();
    expect(mockClearMemory).toHaveBeenCalledTimes(1);
  });
});

describe("InnerSelfSheet memory in-flight protection", () => {
  it("locks the editor and ignores extra taps while a save is in flight", async () => {
    const pending = deferred<{ summary: string }>();
    mockUpdateMemory.mockReturnValue(pending.promise);
    const {
      UNSAFE_getByType,
      findByTestId,
      findByText,
      getByTestId,
      queryByTestId,
      queryByText,
    } = await openMemoryTab();

    fireEvent.press(getByTestId("memory-edit"));
    const input = await findByTestId("memory-edit-input");
    fireEvent.changeText(input, "A slow save");
    fireEvent.press(getByTestId("memory-edit-save"));

    // While the request is pending: spinner replaces the Save label and the
    // input is locked.
    await waitFor(() => {
      expect(queryByText("Save")).toBeNull();
    });
    expect(UNSAFE_getByType(ActivityIndicator)).toBeTruthy();
    expect(input.props.editable).toBe(false);

    // A second (and third) tap must not fire a duplicate request.
    fireEvent.press(getByTestId("memory-edit-save"));
    fireEvent.press(getByTestId("memory-edit-save"));
    expect(mockUpdateMemory).toHaveBeenCalledTimes(1);

    // Cancel is disabled mid-flight — the editor must stay open.
    fireEvent.press(getByTestId("memory-edit-cancel"));
    expect(getByTestId("memory-edit-input")).toBeTruthy();

    pending.resolve({ summary: "A slow save" });

    expect(await findByText("A slow save")).toBeTruthy();
    expect(queryByTestId("memory-edit-input")).toBeNull();
  });

  it("locks the confirm row and ignores extra taps while forgetting is in flight", async () => {
    const pending = deferred<void>();
    mockClearMemory.mockReturnValue(pending.promise as never);
    const { UNSAFE_getByType, findByTestId, findByText, getByTestId, queryByText } =
      await openMemoryTab();

    fireEvent.press(getByTestId("memory-clear"));
    fireEvent.press(await findByTestId("memory-clear-confirm"));

    // While the request is pending: spinner replaces the Forget label.
    await waitFor(() => {
      expect(queryByText("Forget")).toBeNull();
    });
    expect(UNSAFE_getByType(ActivityIndicator)).toBeTruthy();

    // Extra taps on the confirm must not fire a duplicate request.
    fireEvent.press(getByTestId("memory-clear-confirm"));
    fireEvent.press(getByTestId("memory-clear-confirm"));
    expect(mockClearMemory).toHaveBeenCalledTimes(1);

    // Keep is disabled mid-flight — the confirm row must stay visible.
    fireEvent.press(getByTestId("memory-clear-cancel"));
    expect(getByTestId("memory-clear-confirm")).toBeTruthy();

    pending.resolve();

    expect(await findByText(/Nothing to remember yet/)).toBeTruthy();
    expect(mockClearMemory).toHaveBeenCalledTimes(1);
  });
});
