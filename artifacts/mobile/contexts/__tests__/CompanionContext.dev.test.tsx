import React from "react";
import { act, renderHook, waitFor } from "@testing-library/react-native";

import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Notifications from "expo-notifications";

import {
  companionCheckInFull,
  createConversation,
  listMessages,
  type Message,
} from "@workspace/api-client-react";

import { CompanionProvider, useCompanion } from "../CompanionContext";

/**
 * Coverage for the `__DEV__`-only QA shortcuts on CompanionContext
 * (`devTriggerCheckIn` / `devScheduleNudgeSoon`). `__DEV__` is true under jest.
 *
 * This file is intentionally self-contained: it mocks `@/lib/auth` so the
 * provider initializes (the auth gate would otherwise leave it "initializing"
 * forever without an AuthProvider in the tree), keeping these tests green and
 * independent of the shared CompanionContext suite's auth setup.
 */

// CompanionContext pulls in native + storage modules at import time; stub them.
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
  }),
  AudioModule: {
    requestRecordingPermissionsAsync: jest
      .fn()
      .mockResolvedValue({ granted: true }),
  },
  createAudioPlayer: jest.fn(),
  setAudioModeAsync: jest.fn().mockResolvedValue(undefined),
}));

jest.mock("expo-file-system/legacy", () => ({
  cacheDirectory: "file:///cache/",
  EncodingType: { Base64: "base64" },
  writeAsStringAsync: jest.fn().mockResolvedValue(undefined),
  readAsStringAsync: jest.fn().mockResolvedValue(""),
  deleteAsync: jest.fn().mockResolvedValue(undefined),
}));

jest.mock("expo-notifications", () => ({
  setNotificationHandler: jest.fn(),
  getPermissionsAsync: jest.fn().mockResolvedValue({ granted: true }),
  requestPermissionsAsync: jest.fn().mockResolvedValue({ granted: true }),
  cancelAllScheduledNotificationsAsync: jest.fn().mockResolvedValue(undefined),
  scheduleNotificationAsync: jest.fn().mockResolvedValue(undefined),
  SchedulableTriggerInputTypes: { TIME_INTERVAL: "timeInterval" },
}));

// Shared manual mock: see artifacts/mobile/__mocks__/@workspace/api-client-react.ts
jest.mock("@workspace/api-client-react");

// Sign the user in so the provider's auth gate passes and it initializes.
jest.mock("@/lib/auth", () => ({
  AuthProvider: ({ children }: { children: React.ReactNode }) => children,
  useAuth: () => ({
    user: {
      id: "u1",
      email: null,
      firstName: null,
      lastName: null,
      profileImageUrl: null,
    },
    isLoading: false,
    isAuthenticated: true,
    login: jest.fn(),
    logout: jest.fn(),
  }),
}));

const mockCreateConversation =
  createConversation as jest.MockedFunction<typeof createConversation>;
const mockListMessages =
  listMessages as jest.MockedFunction<typeof listMessages>;
const mockCompanionCheckIn =
  companionCheckInFull as jest.MockedFunction<typeof companionCheckInFull>;
const mockSchedule =
  Notifications.scheduleNotificationAsync as jest.MockedFunction<
    typeof Notifications.scheduleNotificationAsync
  >;

function makeMessage(
  id: number,
  role: Message["role"],
  content: string,
): Message {
  return {
    id,
    conversationId: 1,
    role,
    content,
    createdAt: new Date("2026-06-12T00:00:00.000Z").toISOString(),
  };
}

function wrapper({ children }: { children: React.ReactNode }) {
  return <CompanionProvider>{children}</CompanionProvider>;
}

async function renderReadyCompanion() {
  const utils = renderHook(() => useCompanion(), { wrapper });
  await waitFor(() => expect(utils.result.current.initializing).toBe(false));
  return utils;
}

/** The `seconds` handed to the OS on the first schedule call. */
function scheduledSeconds(): number {
  const arg = mockSchedule.mock.calls[0][0] as unknown as {
    trigger: { seconds: number };
  };
  return arg.trigger.seconds;
}

beforeEach(async () => {
  jest.clearAllMocks();
  await AsyncStorage.clear();
  mockCreateConversation.mockResolvedValue({
    id: 1,
    title: "Empiri",
    createdAt: new Date("2026-06-12T00:00:00.000Z").toISOString(),
    lastMessageText: null,
    lastMessageAt: null,
  });
  // A fresh conversation: the companion is "just here", so the normal
  // time-based check-in would never fire on its own.
  mockListMessages.mockResolvedValue([]);
});

describe("CompanionContext dev shortcuts", () => {
  it("devTriggerCheckIn fires a greeting immediately, ignoring the time-away threshold", async () => {
    mockCompanionCheckIn.mockResolvedValue({
      ...makeMessage(2, "assistant", "Hey — just thinking of you!"),
      reflectionThought: null,
    });

    const { result } = await renderReadyCompanion();

    // Quiet the audio path so the assertion stays on the message, not playback.
    act(() => {
      result.current.toggleVoice();
    });
    await waitFor(() => expect(result.current.voiceEnabled).toBe(false));

    // Nothing reached out on its own — the conversation was just created.
    expect(mockCompanionCheckIn).not.toHaveBeenCalled();

    await act(async () => {
      await result.current.devTriggerCheckIn();
    });

    // The dev shortcut forces the greeting regardless of elapsed time.
    expect(mockCompanionCheckIn).toHaveBeenCalledTimes(1);
    expect(
      result.current.messages.some(
        (m) => m.content === "Hey — just thinking of you!",
      ),
    ).toBe(true);
  });

  it("devScheduleNudgeSoon schedules a nudge seconds out, not the production hours", async () => {
    const { result } = await renderReadyCompanion();

    await act(async () => {
      await result.current.devScheduleNudgeSoon();
    });

    // A few seconds out (the dev delay), never the production minute+ floor.
    expect(mockSchedule).toHaveBeenCalledTimes(1);
    expect(scheduledSeconds()).toBe(5);
  });
});
