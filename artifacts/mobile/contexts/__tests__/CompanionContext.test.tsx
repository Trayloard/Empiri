import React from "react";
import { act, renderHook, waitFor } from "@testing-library/react-native";

import AsyncStorage from "@react-native-async-storage/async-storage";

import {
  companionCheckIn,
  createConversation,
  listMessages,
  sendMessage,
  type Message,
} from "@workspace/api-client-react";

import { CompanionProvider, useCompanion } from "../CompanionContext";

/**
 * Regression coverage for the bug where a failed AI reply silently showed an
 * empty assistant bubble and a "happy" companion.
 *
 * The reply flow used to stream over SSE (an `error` event or a missing `done`
 * event signalled failure). It is now a single request/response: a failed reply
 * is a rejected `sendMessage(...)` and there is no per-message mood — the
 * companion's `status` returns to `idle` and the assistant bubble only ever
 * appears for a real reply. These tests lock in the same invariant against the
 * current architecture: a failure must surface a friendly error, never a blank
 * or "happy" (replying) companion; a success must show the reply text.
 */

const FRIENDLY_ERROR = "Empiri couldn't reply just now. Try again.";

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

// Notifications are best-effort and pull in native modules; stub them.
jest.mock("expo-notifications", () => ({
  setNotificationHandler: jest.fn(),
  getPermissionsAsync: jest.fn().mockResolvedValue({ granted: true }),
  requestPermissionsAsync: jest.fn().mockResolvedValue({ granted: true }),
  cancelAllScheduledNotificationsAsync: jest.fn().mockResolvedValue(undefined),
  scheduleNotificationAsync: jest.fn().mockResolvedValue(undefined),
  SchedulableTriggerInputTypes: { TIME_INTERVAL: "timeInterval" },
}));

// Fully mock the data client so we can drive success/failure deterministically.
jest.mock("@workspace/api-client-react", () => ({
  companionCheckIn: jest.fn(),
  createConversation: jest.fn(),
  listMessages: jest.fn(),
  sendMessage: jest.fn(),
  synthesizeSpeech: jest.fn(),
  transcribeAudio: jest.fn(),
}));

const mockCreateConversation =
  createConversation as jest.MockedFunction<typeof createConversation>;
const mockListMessages =
  listMessages as jest.MockedFunction<typeof listMessages>;
const mockSendMessage = sendMessage as jest.MockedFunction<typeof sendMessage>;
const mockCompanionCheckIn =
  companionCheckIn as jest.MockedFunction<typeof companionCheckIn>;

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
  // The provider creates/loads a conversation on mount; wait until that's done
  // so `sendText` has a conversation id to work with.
  await waitFor(() => expect(utils.result.current.initializing).toBe(false));
  return utils;
}

beforeEach(async () => {
  jest.clearAllMocks();
  // AsyncStorage persists between tests in the same file; reset it so stored
  // prefs (e.g. voiceEnabled) from one test don't bleed into the next.
  await AsyncStorage.clear();
  mockCreateConversation.mockResolvedValue({
    id: 1,
    title: "Empiri",
    createdAt: new Date("2026-06-12T00:00:00.000Z").toISOString(),
  });
  mockListMessages.mockResolvedValue([]);
});

describe("CompanionContext failed-reply handling", () => {
  it("surfaces a friendly error and never a blank or happy companion when the reply fails", async () => {
    mockSendMessage.mockRejectedValueOnce(new Error("AI unavailable"));
    // The server persists the user's message but produced no assistant reply.
    mockListMessages.mockResolvedValue([makeMessage(1, "user", "hello")]);

    const { result } = await renderReadyCompanion();

    await act(async () => {
      await result.current.sendText("hello");
    });

    // A non-blank, friendly error is shown to the user.
    expect(result.current.error).toBe(FRIENDLY_ERROR);

    // No assistant bubble appears — the companion never looks like it replied.
    const assistantMessages = result.current.messages.filter(
      (m) => m.role === "assistant",
    );
    expect(assistantMessages).toHaveLength(0);

    // The companion returns to rest, never the "speaking" (replying) state.
    expect(result.current.status).toBe("idle");
    expect(result.current.status).not.toBe("speaking");
  });

  it("treats a dropped/incomplete reply as a failure too (no silent blank bubble)", async () => {
    // Analogous to the old "stream ended without a done event": a different
    // failure cause, but it must be handled just as safely.
    mockSendMessage.mockRejectedValueOnce(new Error("Network request failed"));

    const { result } = await renderReadyCompanion();

    await act(async () => {
      await result.current.sendText("are you there?");
    });

    expect(result.current.error).toBe(FRIENDLY_ERROR);
    expect(result.current.messages.some((m) => m.role === "assistant")).toBe(
      false,
    );
    // No empty-content bubble slipped through.
    expect(
      result.current.messages.every((m) => m.content.trim().length > 0),
    ).toBe(true);
    expect(result.current.status).toBe("idle");
  });

  it("treats a 200 response with empty assistant content as a failed turn (no blank bubble)", async () => {
    // The request succeeds (200) but the assistant content is whitespace-only.
    // It must be handled like any other failed turn, never appended as a bubble.
    mockSendMessage.mockResolvedValueOnce({
      userMessage: makeMessage(1, "user", "hello"),
      assistantMessage: makeMessage(2, "assistant", "   "),
    });

    const { result } = await renderReadyCompanion();

    await act(async () => {
      await result.current.sendText("hello");
    });

    // A friendly error is shown instead of a silent blank bubble.
    expect(result.current.error).toBe(FRIENDLY_ERROR);

    // No assistant bubble appears, and no empty-content message slipped through.
    expect(result.current.messages.some((m) => m.role === "assistant")).toBe(
      false,
    );
    expect(
      result.current.messages.every((m) => m.content.trim().length > 0),
    ).toBe(true);

    // The turn stays retryable and the companion returns to rest.
    expect(result.current.failedTurn?.content).toBe("hello");
    expect(result.current.status).toBe("idle");
  });

  it("lets the user retry a failed turn without retyping, and succeeds on retry", async () => {
    // First attempt fails, the retry succeeds.
    mockSendMessage.mockRejectedValueOnce(new Error("AI unavailable"));
    mockSendMessage.mockResolvedValueOnce({
      userMessage: makeMessage(1, "user", "hello"),
      assistantMessage: makeMessage(2, "assistant", "Hey! Good to see you."),
    });

    const { result } = await renderReadyCompanion();

    act(() => {
      result.current.toggleVoice();
    });
    await waitFor(() => expect(result.current.voiceEnabled).toBe(false));

    await act(async () => {
      await result.current.sendText("hello");
    });

    // The failure is retryable and the user's text was preserved on screen.
    expect(result.current.error).toBe(FRIENDLY_ERROR);
    expect(result.current.failedTurn).not.toBeNull();
    expect(result.current.failedTurn?.content).toBe("hello");
    expect(result.current.messages.some((m) => m.content === "hello")).toBe(
      true,
    );

    // One tap re-sends the same message — no retyping.
    await act(async () => {
      await result.current.retryMessage();
    });

    const assistantMessages = result.current.messages.filter(
      (m) => m.role === "assistant",
    );
    expect(assistantMessages).toHaveLength(1);
    expect(assistantMessages[0].content).toBe("Hey! Good to see you.");
    // Only a single user copy of "hello" remains — no duplicate from the retry.
    expect(
      result.current.messages.filter((m) => m.content === "hello"),
    ).toHaveLength(1);
    expect(result.current.error).toBeNull();
    expect(result.current.failedTurn).toBeNull();
    expect(result.current.status).toBe("idle");
    expect(mockSendMessage).toHaveBeenCalledTimes(2);
  });

  it("shows the error again when a retry also fails", async () => {
    mockSendMessage.mockRejectedValue(new Error("still down"));

    const { result } = await renderReadyCompanion();

    act(() => {
      result.current.toggleVoice();
    });
    await waitFor(() => expect(result.current.voiceEnabled).toBe(false));

    await act(async () => {
      await result.current.sendText("hello");
    });
    expect(result.current.failedTurn).not.toBeNull();

    await act(async () => {
      await result.current.retryMessage();
    });

    // A second failure surfaces the error and keeps the turn retryable.
    expect(result.current.error).toBe(FRIENDLY_ERROR);
    expect(result.current.failedTurn?.content).toBe("hello");
    expect(result.current.messages.some((m) => m.role === "assistant")).toBe(
      false,
    );
    expect(result.current.status).toBe("idle");
  });

  it("shows the companion's reply and clears any error on success", async () => {
    mockSendMessage.mockResolvedValueOnce({
      userMessage: makeMessage(1, "user", "hello"),
      assistantMessage: makeMessage(2, "assistant", "Hey! So good to see you."),
    });

    const { result } = await renderReadyCompanion();

    // Turn voice off so the success path doesn't enter audio playback.
    act(() => {
      result.current.toggleVoice();
    });
    await waitFor(() => expect(result.current.voiceEnabled).toBe(false));

    await act(async () => {
      await result.current.sendText("hello");
    });

    const assistantMessages = result.current.messages.filter(
      (m) => m.role === "assistant",
    );
    expect(assistantMessages).toHaveLength(1);
    expect(assistantMessages[0].content).toBe("Hey! So good to see you.");
    expect(result.current.error).toBeNull();
    expect(result.current.status).toBe("idle");
  });
});

describe("CompanionContext proactive check-in", () => {
  const DAY_MS = 24 * 60 * 60 * 1000;

  beforeEach(async () => {
    await AsyncStorage.clear();
  });

  afterEach(async () => {
    await AsyncStorage.clear();
  });

  it("greets the user first after a long absence", async () => {
    // Existing conversation with prior history, last touched a day ago.
    await AsyncStorage.setItem("empiri.conversationId", "1");
    await AsyncStorage.setItem("empiri.voiceEnabled", "false");
    await AsyncStorage.setItem(
      "empiri.moodState",
      JSON.stringify({
        baseMood: 100,
        baseEnergy: 100,
        lastInteraction: Date.now() - DAY_MS,
      }),
    );
    mockListMessages.mockResolvedValue([makeMessage(1, "user", "earlier hi")]);
    mockCompanionCheckIn.mockResolvedValue(
      makeMessage(2, "assistant", "I missed you — how have you been?"),
    );

    const { result } = await renderReadyCompanion();

    await waitFor(() =>
      expect(
        result.current.messages.some(
          (m) => m.content === "I missed you — how have you been?",
        ),
      ).toBe(true),
    );
    expect(mockCompanionCheckIn).toHaveBeenCalledTimes(1);
    // The companion still reads as faded until the user replies.
    expect(["sleepy", "low"]).toContain(result.current.mood.label);
  });

  it("does not reach out when the user was here recently", async () => {
    await AsyncStorage.setItem("empiri.conversationId", "1");
    await AsyncStorage.setItem(
      "empiri.moodState",
      JSON.stringify({
        baseMood: 100,
        baseEnergy: 100,
        lastInteraction: Date.now() - 60 * 1000,
      }),
    );
    mockListMessages.mockResolvedValue([makeMessage(1, "user", "earlier hi")]);

    await renderReadyCompanion();

    expect(mockCompanionCheckIn).not.toHaveBeenCalled();
  });
});
