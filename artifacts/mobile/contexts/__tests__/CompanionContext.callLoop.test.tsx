import React from "react";
import { act, renderHook, waitFor } from "@testing-library/react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  createConversation,
  listMessages,
} from "@workspace/api-client-react";
import { CompanionProvider, useCompanion } from "../CompanionContext";

/**
 * Fake-timer unit tests for the audio call loop (startCall / endCall).
 *
 * Coverage:
 *  1. isCallActive lifecycle — goes true on startCall, false on endCall.
 *  2. endCall unblocking — resolves the 20 s round promise immediately without
 *     waiting for the timeout, and the call promise itself settles.
 *  3. Round auto-stop — the 20 s timer fires, stopListening is called, and
 *     the loop starts the next round.
 *  4. Consecutive-error bail-out — after MAX_CONSECUTIVE_ERRORS (2) rounds
 *     where stopListening returns false, the loop exits on its own.
 *
 * Recorder uri is intentionally null in the mock so every stopListening call
 * short-circuits and returns false (no audio to transcribe). This drives
 * consecutive-error counting without requiring real audio/network.
 *
 * Timer strategy: render the companion with real timers so that waitFor works
 * during setup, then switch to fake timers for the call-loop portion of each
 * test. setImmediate / nextTick / queueMicrotask are NOT faked so that
 * waitFor's internal polling continues to work.
 */

// ── Mocks ────────────────────────────────────────────────────────────────────

jest.mock("@react-native-async-storage/async-storage", () =>
  require("@react-native-async-storage/async-storage/jest/async-storage-mock"),
);

jest.mock("expo-audio", () => ({
  RecordingPresets: { HIGH_QUALITY: {}, LOW_QUALITY: {} },
  useAudioRecorder: () => ({
    prepareToRecordAsync: jest.fn().mockResolvedValue(undefined),
    record: jest.fn(),
    stop: jest.fn().mockResolvedValue(undefined),
    uri: null, // → stopListening always returns false (no audio uri)
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

jest.mock("@/lib/auth", () => ({
  useAuth: () => ({
    user: { id: "test-user" },
    isLoading: false,
    isAuthenticated: true,
    login: jest.fn(),
    logout: jest.fn().mockResolvedValue(undefined),
  }),
}));

jest.mock("@/lib/notifications", () => ({
  cancelNudges: jest.fn().mockResolvedValue(undefined),
  requestNotificationPermission: jest.fn().mockResolvedValue(true),
  scheduleNudge: jest.fn().mockResolvedValue(undefined),
  scheduleNudgeInSeconds: jest.fn().mockResolvedValue(undefined),
}));

jest.mock("expo-notifications", () => ({
  setNotificationHandler: jest.fn(),
  getPermissionsAsync: jest.fn().mockResolvedValue({ granted: true }),
  requestPermissionsAsync: jest.fn().mockResolvedValue({ granted: true }),
  cancelAllScheduledNotificationsAsync: jest.fn().mockResolvedValue(undefined),
  scheduleNotificationAsync: jest.fn().mockResolvedValue(undefined),
  SchedulableTriggerInputTypes: { TIME_INTERVAL: "timeInterval" },
}));

jest.mock("@workspace/api-client-react", () => ({
  companionCheckIn: jest.fn(),
  createConversation: jest.fn(),
  devRegressSelf: jest.fn(),
  fetchStream: jest.fn(),
  getCompanionSettings: jest.fn().mockRejectedValue(new Error("not mocked")),
  getConversation: jest.fn().mockRejectedValue(new Error("not mocked")),
  listConversations: jest.fn().mockResolvedValue([]),
  listMessages: jest.fn(),
  renameConversation: jest.fn(),
  sendMessage: jest.fn(),
  synthesizeSpeech: jest.fn(),
  transcribeAudio: jest.fn(),
  updateCompanionSettings: jest.fn(),
}));

// ── Helpers ───────────────────────────────────────────────────────────────────

const mockCreateConversation =
  createConversation as jest.MockedFunction<typeof createConversation>;
const mockListMessages =
  listMessages as jest.MockedFunction<typeof listMessages>;

function wrapper({ children }: { children: React.ReactNode }) {
  return <CompanionProvider>{children}</CompanionProvider>;
}

/** Renders and waits until the companion has finished initializing. */
async function renderReadyCompanion() {
  const utils = renderHook(() => useCompanion(), { wrapper });
  await waitFor(() => expect(utils.result.current.initializing).toBe(false));
  return utils;
}

/**
 * Advance fake timers by `ms` and flush all pending promise microtasks.
 * Must only be called after jest.useFakeTimers().
 */
async function tick(ms: number): Promise<void> {
  await act(async () => {
    await jest.advanceTimersByTimeAsync(ms);
  });
}

// ── Setup / teardown ──────────────────────────────────────────────────────────

beforeEach(async () => {
  jest.clearAllMocks();
  await AsyncStorage.clear();
  mockCreateConversation.mockResolvedValue({
    id: 1,
    title: "Empiri",
    createdAt: new Date("2026-06-12T00:00:00.000Z").toISOString(),
  });
  mockListMessages.mockResolvedValue([]);
});

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("Audio call loop — startCall / endCall", () => {
  it("isCallActive is true while the loop runs and false after endCall", async () => {
    // Render with real timers so waitFor works during companion init.
    const { result } = await renderReadyCompanion();

    // Switch to fake timers (keep setImmediate/nextTick real for waitFor).
    jest.useFakeTimers({
      doNotFake: ["setImmediate", "nextTick", "queueMicrotask"],
    });
    try {
      act(() => {
        result.current.startCall();
      });
      // startListening is async; let its awaits resolve.
      await tick(0);

      await waitFor(() => expect(result.current.isCallActive).toBe(true));

      act(() => {
        result.current.endCall();
      });
      await tick(0);

      await waitFor(() => expect(result.current.isCallActive).toBe(false));
    } finally {
      jest.useRealTimers();
    }
  });

  it("endCall resolves the pending round promise immediately — no need to wait 20 s", async () => {
    const { result } = await renderReadyCompanion();

    jest.useFakeTimers({
      doNotFake: ["setImmediate", "nextTick", "queueMicrotask"],
    });
    try {
      let callFinished = false;

      act(() => {
        result.current.startCall().finally(() => {
          callFinished = true;
        });
      });
      await tick(0);

      await waitFor(() => expect(result.current.isCallActive).toBe(true));

      // Trigger endCall well before the 20 s timer would fire.
      act(() => {
        result.current.endCall();
      });
      // Flush microtasks so the loop's while condition re-evaluates and exits.
      await tick(0);

      await waitFor(() => expect(result.current.isCallActive).toBe(false));
      // The startCall() promise must have settled (finally block ran).
      await waitFor(() => expect(callFinished).toBe(true));

      // Advance past the original 20 s to confirm the timer is cancelled and
      // nothing re-starts (isCallActive stays false, no errors thrown).
      await tick(25_000);
      expect(result.current.isCallActive).toBe(false);
    } finally {
      jest.useRealTimers();
    }
  });

  it("the 20 s timer fires, stopListening is called, and a new round starts", async () => {
    const { result } = await renderReadyCompanion();

    jest.useFakeTimers({
      doNotFake: ["setImmediate", "nextTick", "queueMicrotask"],
    });
    try {
      act(() => {
        result.current.startCall();
      });

      // Wait for round 1 to reach the listening state.
      await tick(0);
      await waitFor(() => expect(result.current.status).toBe("listening"));

      // Advance 20 s → setTimeout fires → round promise resolves →
      // stopListening runs (uri=null → false, 1 consecutive error) →
      // consecutiveErrors (1) < MAX_CONSECUTIVE_ERRORS (2) → round 2 starts.
      await tick(20_000);

      // Round 2 must be listening.
      await waitFor(() => expect(result.current.status).toBe("listening"));
      expect(result.current.isCallActive).toBe(true);

      // Clean up.
      act(() => {
        result.current.endCall();
      });
      await tick(0);
      await waitFor(() => expect(result.current.isCallActive).toBe(false));
    } finally {
      jest.useRealTimers();
    }
  });

  it("auto-exits after MAX_CONSECUTIVE_ERRORS (2) consecutive failed rounds", async () => {
    const { result } = await renderReadyCompanion();

    jest.useFakeTimers({
      doNotFake: ["setImmediate", "nextTick", "queueMicrotask"],
    });
    try {
      let callFinished = false;

      act(() => {
        result.current.startCall().finally(() => {
          callFinished = true;
        });
      });

      // Round 1.
      await tick(0);
      await waitFor(() => expect(result.current.status).toBe("listening"));

      // Round 1 timer fires → stopListening returns false → consecutiveErrors=1.
      await tick(20_000);

      // Round 2 starts.
      await waitFor(() => expect(result.current.status).toBe("listening"));

      // Round 2 timer fires → stopListening returns false → consecutiveErrors=2
      // → MAX_CONSECUTIVE_ERRORS reached → loop breaks.
      await tick(20_000);

      // No endCall needed — the loop self-terminates.
      await waitFor(() => expect(result.current.isCallActive).toBe(false));
      await waitFor(() => expect(callFinished).toBe(true));
    } finally {
      jest.useRealTimers();
    }
  });
});
