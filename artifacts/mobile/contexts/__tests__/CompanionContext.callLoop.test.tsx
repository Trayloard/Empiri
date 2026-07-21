import React from "react";
import { act, renderHook, waitFor } from "@testing-library/react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  createConversation,
  listMessages,
} from "@workspace/api-client-react";
import { AudioModule } from "expo-audio";
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
 *  4. Consecutive-error bail-out — after MAX_CONSECUTIVE_ERRORS (4) rounds
 *     where stopListening returns false, the loop exits on its own.
 *  5. startListening failure — when startListening cannot start recording
 *     (e.g. mic permission denied), the loop exits immediately on the first
 *     attempt without spinning or retrying.
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

// Shared manual mock: see artifacts/mobile/__mocks__/@workspace/api-client-react.ts
jest.mock("@workspace/api-client-react");

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

  it("auto-exits after MAX_CONSECUTIVE_ERRORS (4) consecutive failed rounds", async () => {
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

      // Rounds 1–4: each timer fires, stopListening returns false (uri=null),
      // consecutiveErrors increments. The loop only breaks when it reaches 4.

      // Round 1.
      await tick(0);
      await waitFor(() => expect(result.current.status).toBe("listening"));
      // Round 1 timer fires → consecutiveErrors=1 (< 4, loop continues).
      await tick(20_000);

      // Round 2.
      await waitFor(() => expect(result.current.status).toBe("listening"));
      // Round 2 timer fires → consecutiveErrors=2 (< 4, loop continues).
      await tick(20_000);

      // Round 3.
      await waitFor(() => expect(result.current.status).toBe("listening"));
      // Round 3 timer fires → consecutiveErrors=3 (< 4, loop continues).
      await tick(20_000);

      // Round 4.
      await waitFor(() => expect(result.current.status).toBe("listening"));
      // Round 4 timer fires → consecutiveErrors=4 → MAX_CONSECUTIVE_ERRORS reached → loop breaks.
      await tick(20_000);

      // No endCall needed — the loop self-terminates.
      await waitFor(() => expect(result.current.isCallActive).toBe(false));
      await waitFor(() => expect(callFinished).toBe(true));
    } finally {
      jest.useRealTimers();
    }
  });
});

describe("Audio call loop — startListening failure exits immediately", () => {
  /**
   * When startListening cannot begin recording (e.g. mic permission denied,
   * native hardware error), `isRecordingRef.current` stays false. The call
   * loop detects this after awaiting startListening() and breaks immediately
   * — no 20 s round timer is armed, no second listen attempt is made, and
   * startCall() settles with isCallActive returning to false.
   *
   * We simulate the failure by making the permission check return
   * `{ granted: false }` for one call. This exercises the exact branch in
   * startListening that returns early without setting isRecordingRef.current,
   * which is the same path taken for any other failure mode (hardware error,
   * setAudioModeAsync throw, etc.).
   */

  it("exits the call loop when startListening fails on the first attempt — no retry, no hanging timer", async () => {
    const { result } = await renderReadyCompanion();

    // Deny the mic permission just for this test so startListening returns
    // early without ever setting isRecordingRef.current = true.
    (
      AudioModule.requestRecordingPermissionsAsync as jest.Mock
    ).mockResolvedValueOnce({ granted: false });

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

      // Flush the permission-check microtask so startListening can resolve.
      await tick(0);

      // The loop detects the failure and exits without waiting 20 s.
      await waitFor(() => expect(result.current.isCallActive).toBe(false));
      await waitFor(() => expect(callFinished).toBe(true));

      // Status returns to idle — never stuck in "listening".
      expect(result.current.status).toBe("idle");

      // startListening was attempted exactly once — the loop did not retry.
      expect(
        AudioModule.requestRecordingPermissionsAsync,
      ).toHaveBeenCalledTimes(1);

      // No 20 s round timer was armed: advancing well past it must leave
      // everything quiet (no second startCall, no errors thrown).
      await tick(25_000);
      expect(result.current.isCallActive).toBe(false);
      // Still called only once — no extra startListening attempts fired.
      expect(
        AudioModule.requestRecordingPermissionsAsync,
      ).toHaveBeenCalledTimes(1);
    } finally {
      jest.useRealTimers();
    }
  });

  it("exits the call loop when startListening throws (native hardware error)", async () => {
    const { result } = await renderReadyCompanion();

    // Make the permission call itself throw — simulates a native crash inside
    // AudioModule. startListening's catch block sets status back to idle and
    // leaves isRecordingRef.current = false, so the call loop breaks.
    (
      AudioModule.requestRecordingPermissionsAsync as jest.Mock
    ).mockRejectedValueOnce(new Error("Native audio module unavailable"));

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

      // The loop must exit cleanly with no uncaught rejection.
      await waitFor(() => expect(result.current.isCallActive).toBe(false));
      await waitFor(() => expect(callFinished).toBe(true));

      expect(result.current.status).toBe("idle");
      expect(
        AudioModule.requestRecordingPermissionsAsync,
      ).toHaveBeenCalledTimes(1);

      // No timer re-fires after the failure.
      await tick(25_000);
      expect(result.current.isCallActive).toBe(false);
    } finally {
      jest.useRealTimers();
    }
  });

  it("clears the mic error automatically when the next startCall succeeds", async () => {
    /**
     * Scenario: permission denied on attempt 1 → error banner shown.
     * User fixes the permission and tries again. On attempt 2, recording
     * starts successfully → setError(null) fires inside startListening →
     * the error banner disappears without the user needing to dismiss it.
     */
    const { result } = await renderReadyCompanion();

    jest.useFakeTimers({
      doNotFake: ["setImmediate", "nextTick", "queueMicrotask"],
    });
    try {
      // ── Attempt 1: permission denied ──────────────────────────────────────
      (
        AudioModule.requestRecordingPermissionsAsync as jest.Mock
      ).mockResolvedValueOnce({ granted: false });

      let call1Finished = false;
      act(() => {
        result.current.startCall().finally(() => {
          call1Finished = true;
        });
      });
      await tick(0);

      await waitFor(() => expect(call1Finished).toBe(true));
      await waitFor(() => expect(result.current.isCallActive).toBe(false));

      // The error message is shown after the first failed attempt.
      expect(result.current.error).toBe(
        "Microphone access is needed to talk to Empiri.",
      );
      expect(result.current.status).toBe("idle");

      // ── Attempt 2: permission granted (default mock) ──────────────────────
      act(() => {
        result.current.startCall();
      });
      // Flush the permission check and prepareToRecordAsync awaits.
      await tick(0);

      // Recording has started — status is "listening" and error is gone.
      await waitFor(() => expect(result.current.status).toBe("listening"));
      expect(result.current.error).toBeNull();
      expect(result.current.isCallActive).toBe(true);

      // Clean up the running call loop.
      act(() => {
        result.current.endCall();
      });
      await tick(0);
      await waitFor(() => expect(result.current.isCallActive).toBe(false));
    } finally {
      jest.useRealTimers();
    }
  });
});

describe("Audio call loop — isCallActive never flashes true on a failed startListening", () => {
  /**
   * startCall used to set isCallActive=true before awaiting startListening.
   * If permission was denied, React committed a render with isCallActive=true
   * before the finally block reset it — causing the UI to briefly flash the
   * "call active" indicator even though recording never started.
   *
   * The fix: setIsCallActive(true) is deferred until after startListening
   * confirms isRecordingRef.current === true.
   *
   * This test locks that invariant in. It checks isCallActive synchronously
   * after all microtasks have flushed — if isCallActive was ever committed
   * as true, React Testing Library would reflect it here.
   */

  it("isCallActive is false throughout when permission is denied — never flashes true", async () => {
    const { result } = await renderReadyCompanion();

    (
      AudioModule.requestRecordingPermissionsAsync as jest.Mock
    ).mockResolvedValueOnce({ granted: false });

    jest.useFakeTimers({
      doNotFake: ["setImmediate", "nextTick", "queueMicrotask"],
    });
    try {
      // Track every isCallActive value that React commits while the call
      // attempt runs. We collect values by reading the hook result after each
      // state flush — if isCallActive is ever true, the array will contain it.
      const observedCallActive: boolean[] = [];

      let callFinished = false;
      act(() => {
        result.current.startCall().finally(() => {
          callFinished = true;
        });
      });

      // Capture the state immediately after the first act flush (where the
      // old implementation would have committed isCallActive=true).
      observedCallActive.push(result.current.isCallActive);

      // Flush the permission-check microtask so startListening can resolve.
      await tick(0);
      observedCallActive.push(result.current.isCallActive);

      await waitFor(() => expect(callFinished).toBe(true));
      observedCallActive.push(result.current.isCallActive);

      // isCallActive must have been false at every observed render.
      expect(observedCallActive.every((v) => v === false)).toBe(true);
      expect(result.current.isCallActive).toBe(false);
      expect(result.current.status).toBe("idle");
    } finally {
      jest.useRealTimers();
    }
  });

  it("isCallActive becomes true only after a successful startListening", async () => {
    const { result } = await renderReadyCompanion();

    jest.useFakeTimers({
      doNotFake: ["setImmediate", "nextTick", "queueMicrotask"],
    });
    try {
      // isCallActive must stay false until recording starts.
      expect(result.current.isCallActive).toBe(false);

      act(() => {
        result.current.startCall();
      });

      // Before flushing microtasks (startListening hasn't resolved yet):
      // isCallActive must still be false even though startCall was called.
      expect(result.current.isCallActive).toBe(false);

      // Flush the permission check and prepareToRecordAsync — startListening
      // succeeds, recording starts, setIsCallActive(true) fires.
      await tick(0);

      await waitFor(() => expect(result.current.isCallActive).toBe(true));
      expect(result.current.status).toBe("listening");

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
});
