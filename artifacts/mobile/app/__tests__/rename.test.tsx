/**
 * End-to-end component test for the rename-chat dialog in the chat header.
 *
 * Strategy: render the real CompanionScreen inside the real CompanionProvider.
 * The only seam mocked is @workspace/api-client-react (the shared auto-mock in
 * __mocks__/@workspace/api-client-react.ts). All native modules are stubbed
 * at the same level as CompanionContext.test.tsx so the provider boots cleanly.
 *
 * Three scenarios:
 *   1. Happy path — pencil opens dialog pre-filled with current title,
 *      entering a new title + Save calls apiRenameConversation, and reopening
 *      the dialog shows the updated title as the draft.
 *
 *   2. Error path — apiRenameConversation rejects, the error banner appears,
 *      the dialog stays open; reopening confirms the old title is preserved.
 *
 *   3. Validation — an empty input shows "Please enter a name." without
 *      hitting the API.
 */

import React from "react";
import { act, fireEvent, render, waitFor } from "@testing-library/react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";

import {
  createConversation,
  listMessages,
  renameConversation as apiRenameConversation,
} from "@workspace/api-client-react";

import { CompanionProvider } from "@/contexts/CompanionContext";

// ── @workspace/api-client-react ───────────────────────────────────────────────
// Shared manual mock: every export becomes a jest.fn(); listConversations
// resolves [], getCompanionSettings and getConversation reject so the provider
// falls back gracefully. See __mocks__/@workspace/api-client-react.ts.
jest.mock("@workspace/api-client-react");

const mockCreateConversation =
  createConversation as jest.MockedFunction<typeof createConversation>;
const mockListMessages =
  listMessages as jest.MockedFunction<typeof listMessages>;
const mockApiRenameConversation =
  apiRenameConversation as jest.MockedFunction<typeof apiRenameConversation>;

// ── Native / storage modules ──────────────────────────────────────────────────

jest.mock("@react-native-async-storage/async-storage", () =>
  require("@react-native-async-storage/async-storage/jest/async-storage-mock"),
);

jest.mock("expo-audio", () => ({
  RecordingPresets: { HIGH_QUALITY: {} },
  useAudioRecorder: () => ({
    prepareToRecordAsync: jest.fn().mockResolvedValue(undefined),
    record: jest.fn(),
    stop: jest.fn().mockResolvedValue(undefined),
    uri: null,
    getStatus: jest.fn().mockReturnValue({ metering: -160 }),
  }),
  AudioModule: {
    requestRecordingPermissionsAsync: jest
      .fn()
      .mockResolvedValue({ granted: true }),
  },
  createAudioPlayer: jest.fn(),
  setAudioModeAsync: jest.fn().mockResolvedValue(undefined),
}));

jest.mock("expo-battery", () => ({
  getBatteryLevelAsync: jest.fn().mockResolvedValue(1),
  getBatteryStateAsync: jest.fn().mockResolvedValue(2),
  addBatteryLevelListener: jest.fn(() => ({ remove: jest.fn() })),
  addBatteryStateListener: jest.fn(() => ({ remove: jest.fn() })),
}));

jest.mock("expo-file-system/legacy", () => ({
  cacheDirectory: "file:///cache/",
  EncodingType: { Base64: "base64" },
  writeAsStringAsync: jest.fn().mockResolvedValue(undefined),
  readAsStringAsync: jest.fn().mockResolvedValue(""),
  deleteAsync: jest.fn().mockResolvedValue(undefined),
}));

jest.mock("expo-sensors", () => ({
  Accelerometer: {
    addListener: jest.fn(() => ({ remove: jest.fn() })),
    setUpdateInterval: jest.fn(),
  },
}));

jest.mock("expo-notifications", () => ({
  setNotificationHandler: jest.fn(),
  getPermissionsAsync: jest.fn().mockResolvedValue({ granted: false }),
  requestPermissionsAsync: jest.fn().mockResolvedValue({ granted: false }),
  cancelAllScheduledNotificationsAsync: jest.fn().mockResolvedValue(undefined),
  scheduleNotificationAsync: jest.fn().mockResolvedValue(undefined),
  SchedulableTriggerInputTypes: { TIME_INTERVAL: "timeInterval" },
}));

jest.mock("@/lib/notifications", () => ({
  cancelNudges: jest.fn().mockResolvedValue(undefined),
  requestNotificationPermission: jest.fn().mockResolvedValue(false),
  scheduleNudge: jest.fn().mockResolvedValue(undefined),
  scheduleNudgeInSeconds: jest.fn().mockResolvedValue(undefined),
}));

// ── @/lib/auth ─────────────────────────────────────────────────────────────────
jest.mock("@/lib/auth", () => ({
  useAuth: () => ({
    user: { id: "user-1" },
    isLoading: false,
    isAuthenticated: true,
    login: jest.fn(),
    logout: jest.fn().mockResolvedValue(undefined),
  }),
}));

// ── Third-party UI / animation stubs ─────────────────────────────────────────

jest.mock("expo-blur", () => {
  const React = require("react");
  const { View } = require("react-native");
  return {
    BlurView: ({ children }: { children?: React.ReactNode }) =>
      React.createElement(View, {}, children),
  };
});

jest.mock("expo-haptics", () => ({
  impactAsync: jest.fn().mockResolvedValue(undefined),
  ImpactFeedbackStyle: { Light: "Light" },
}));

jest.mock("expo-router", () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn() }),
}));

jest.mock("expo-status-bar", () => ({ StatusBar: () => null }));

jest.mock("react-native-gesture-handler", () => {
  const React = require("react");
  const { View } = require("react-native");
  return {
    Gesture: {
      Pan: () => ({
        onBegin: function () { return this; },
        onChange: function () { return this; },
      }),
    },
    GestureDetector: ({ children }: { children?: React.ReactNode }) =>
      React.createElement(View, {}, children),
  };
});

jest.mock("react-native-keyboard-controller", () => {
  const React = require("react");
  const { View } = require("react-native");
  return {
    KeyboardAvoidingView: ({ children }: { children?: React.ReactNode }) =>
      React.createElement(View, {}, children),
  };
});

jest.mock("react-native-reanimated", () => {
  const { View } = require("react-native");
  return {
    __esModule: true,
    default: { View },
    useSharedValue: (v: unknown) => ({ value: v }),
    useAnimatedStyle: () => ({}),
    useReducedMotion: () => false,
    withTiming: (v: unknown) => v,
    withSpring: (v: unknown) => v,
    Easing: {
      linear: 0,
      inOut: () => () => 0,
      out: () => () => 0,
      cubic: () => 0,
      quad: () => 0,
    },
    Animated: { View },
  };
});

jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

// ── Internal component stubs ──────────────────────────────────────────────────

jest.mock("@/components/AmbientGlow", () => ({ AmbientGlow: () => null }));
jest.mock("@/components/ChatInput", () => ({ ChatInput: () => null }));
jest.mock("@/components/ChatSwitcherSheet", () => ({
  ChatSwitcherSheet: () => null,
}));
jest.mock("@/components/CheckInSettingsSheet", () => ({
  CheckInSettingsSheet: () => null,
}));
jest.mock("@/components/CompanionOrb", () => ({ CompanionOrb: () => null }));
jest.mock("@/components/InnerSelfSheet", () => ({ InnerSelfSheet: () => null }));
jest.mock("@/components/MessageBubble", () => ({
  MessageBubble: () => null,
  RetryBubble: () => null,
  TypingBubble: () => null,
}));

// ── Internal hook / util stubs ────────────────────────────────────────────────

jest.mock("@/hooks/useAccentColor", () => ({ useSmoothedWarmth: () => 0 }));

jest.mock("@/hooks/useColors", () => ({
  useColors: () => ({
    background: "#000",
    foreground: "#fff",
    primary: "#7c3aed",
    primaryForeground: "#fff",
    mutedForeground: "#888",
    glass: "rgba(255,255,255,0.1)",
    glassBorder: "rgba(255,255,255,0.2)",
    blurTint: "dark",
    statusAccent: "#7c3aed",
    spectrum: [],
    destructive: "#ef4444",
  }),
}));

jest.mock("@/hooks/useCompanionTraits", () => ({
  useCompanionTraits: () => ({ warmthShift: 0, energyShift: 0, curiosityShift: 0 }),
}));

jest.mock("@/lib/accent", () => ({
  accentForWarmth: (_warmth: unknown, base: unknown) => base,
}));

jest.mock("@/constants/fonts", () => ({ FONTS: {} }));

jest.mock("@expo/vector-icons", () => {
  const React = require("react");
  const { View } = require("react-native");
  return {
    Feather: ({ name }: { name: unknown }) =>
      React.createElement(View, { testID: `feather-${name}` }),
  };
});

// ── Helpers ───────────────────────────────────────────────────────────────────

import CompanionScreen from "../index";

const INITIAL_TITLE = "Chat Night";
const CREATED_AT = new Date("2026-06-12T00:00:00.000Z").toISOString();

function renderScreen() {
  return render(
    <CompanionProvider>
      <CompanionScreen />
    </CompanionProvider>,
  );
}

beforeEach(async () => {
  jest.clearAllMocks();
  await AsyncStorage.clear();

  // Provider init: no stored conversation id → createConversation is called.
  mockCreateConversation.mockResolvedValue({
    id: 1,
    title: INITIAL_TITLE,
    createdAt: CREATED_AT,
  });
  mockListMessages.mockResolvedValue([]);
});

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("Rename-chat dialog — end to end", () => {
  it("happy path: enters a new title, saves, and the updated title becomes the pre-fill on re-open", async () => {
    // API returns the canonical title from the server.
    mockApiRenameConversation.mockResolvedValue({
      id: 1,
      title: "Morning Pages",
      createdAt: CREATED_AT,
    });

    const { getByTestId, queryByText } = renderScreen();

    // Wait for the provider to finish initialising (pencil button appears).
    await waitFor(() => expect(getByTestId("chat-title")).toBeTruthy());

    // Open the rename dialog.
    await act(async () => {
      fireEvent.press(getByTestId("chat-title"));
    });

    // Pre-fill must match the current conversation title from the context.
    const input = getByTestId("rename-input");
    expect(input.props.value).toBe(INITIAL_TITLE);

    // Enter the new title and save.
    fireEvent.changeText(input, "Morning Pages");
    await act(async () => {
      fireEvent.press(getByTestId("rename-save"));
    });

    // The API must have been called with the correct args.
    expect(mockApiRenameConversation).toHaveBeenCalledTimes(1);
    expect(mockApiRenameConversation).toHaveBeenCalledWith(1, {
      title: "Morning Pages",
    });

    // No error banner after a successful save.
    expect(queryByText("Couldn't rename the chat. Try again.")).toBeNull();

    // Reopen the dialog — the draft should now reflect the server's title,
    // confirming that conversationTitle in the context was updated.
    await act(async () => {
      fireEvent.press(getByTestId("chat-title"));
    });
    await waitFor(() => {
      expect(getByTestId("rename-input").props.value).toBe("Morning Pages");
    });
  });

  it("error path: shows an error, and the old title is preserved when the dialog is reopened", async () => {
    mockApiRenameConversation.mockRejectedValue(new Error("Network error"));

    const { getByTestId, getByText } = renderScreen();

    await waitFor(() => expect(getByTestId("chat-title")).toBeTruthy());

    // Open, type a new title, attempt to save.
    await act(async () => {
      fireEvent.press(getByTestId("chat-title"));
    });
    fireEvent.changeText(getByTestId("rename-input"), "New Name");
    await act(async () => {
      fireEvent.press(getByTestId("rename-save"));
    });

    // Error message must be visible.
    await waitFor(() => {
      expect(getByText("Couldn't rename the chat. Try again.")).toBeTruthy();
    });

    // Reopen the dialog (pressing the pencil resets the draft to conversationTitle).
    await act(async () => {
      fireEvent.press(getByTestId("chat-title"));
    });

    // The old title is preserved — conversationTitle was not mutated on failure.
    expect(getByTestId("rename-input").props.value).toBe(INITIAL_TITLE);
  });

  it("validation: submitting an empty title shows an error without calling the API", async () => {
    const { getByTestId, getByText, queryByText } = renderScreen();

    await waitFor(() => expect(getByTestId("chat-title")).toBeTruthy());

    await act(async () => {
      fireEvent.press(getByTestId("chat-title"));
    });

    // Clear the input.
    fireEvent.changeText(getByTestId("rename-input"), "");

    await act(async () => {
      fireEvent.press(getByTestId("rename-save"));
    });

    expect(mockApiRenameConversation).not.toHaveBeenCalled();
    expect(getByText("Please enter a name.")).toBeTruthy();
    expect(queryByText("Couldn't rename the chat. Try again.")).toBeNull();
  });
});
