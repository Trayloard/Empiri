import React from "react";
import { act, renderHook, waitFor } from "@testing-library/react-native";

import AsyncStorage from "@react-native-async-storage/async-storage";

import {
  companionCheckInFull,
  createConversation,
  getConversation,
  listConversations,
  listMessages,
  renameConversation,
  sendMessage,
  type Message,
} from "@workspace/api-client-react";

import { CompanionProvider, useCompanion } from "../CompanionContext";
import { DEFAULT_CADENCE } from "@/lib/mood";
import {
  cancelNudges,
  requestNotificationPermission,
  scheduleNudge,
} from "@/lib/notifications";

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

// The provider only initializes once auth has resolved; without an
// AuthProvider in the test tree the default context stays loading forever.
// Present a signed-in, settled auth state so the companion can boot.
jest.mock("@/lib/auth", () => ({
  useAuth: () => ({
    user: { id: "test-user" },
    isLoading: false,
    isAuthenticated: true,
    login: jest.fn(),
    logout: jest.fn().mockResolvedValue(undefined),
  }),
}));

// Mock the notification helpers directly so the bell <-> cadence tests can
// drive permission grant/denial deterministically and assert on nudge
// scheduling/cancellation without touching native modules.
jest.mock("@/lib/notifications", () => ({
  cancelNudges: jest.fn().mockResolvedValue(undefined),
  requestNotificationPermission: jest.fn().mockResolvedValue(true),
  scheduleNudge: jest.fn().mockResolvedValue(undefined),
  scheduleNudgeInSeconds: jest.fn().mockResolvedValue(undefined),
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
// Shared manual mock: see artifacts/mobile/__mocks__/@workspace/api-client-react.ts
jest.mock("@workspace/api-client-react");

const mockCreateConversation =
  createConversation as jest.MockedFunction<typeof createConversation>;
const mockListMessages =
  listMessages as jest.MockedFunction<typeof listMessages>;
const mockSendMessage = sendMessage as jest.MockedFunction<typeof sendMessage>;
const mockCompanionCheckIn =
  companionCheckInFull as jest.MockedFunction<typeof companionCheckInFull>;

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

describe("CompanionContext sad-mood arc", () => {
  it("turns sad when the reply fails, then recovers to a computed mood after a successful reply", async () => {
    mockSendMessage.mockRejectedValueOnce(new Error("AI unavailable"));
    mockSendMessage.mockResolvedValueOnce({
      userMessage: makeMessage(1, "user", "hello"),
      assistantMessage: makeMessage(2, "assistant", "Hey! Good to see you."),
    });

    const { result } = await renderReadyCompanion();

    // Turn voice off so the success path doesn't enter audio playback.
    act(() => {
      result.current.toggleVoice();
    });
    await waitFor(() => expect(result.current.voiceEnabled).toBe(false));

    // The companion starts from a fresh, non-sad mood.
    expect(result.current.mood.label).not.toBe("sad");

    await act(async () => {
      await result.current.sendText("hello");
    });

    // The failed delivery makes the companion sad.
    expect(result.current.mood.label).toBe("sad");
    expect(result.current.error).toBe(FRIENDLY_ERROR);

    await act(async () => {
      await result.current.retryMessage();
    });

    // A real exchange lifts the mood back to a computed (never "sad") label —
    // "sad" is only ever set imperatively by the error path, and the fresh
    // snapshot plus interaction boost lands the companion at "bright".
    expect(result.current.mood.label).not.toBe("sad");
    expect(result.current.mood.label).toBe("bright");
    expect(result.current.error).toBeNull();
  });

  it("stays sad while retries keep failing", async () => {
    mockSendMessage.mockRejectedValue(new Error("still down"));

    const { result } = await renderReadyCompanion();

    act(() => {
      result.current.toggleVoice();
    });
    await waitFor(() => expect(result.current.voiceEnabled).toBe(false));

    await act(async () => {
      await result.current.sendText("hello");
    });
    expect(result.current.mood.label).toBe("sad");

    await act(async () => {
      await result.current.retryMessage();
    });

    // No successful exchange happened, so the companion never perks up.
    expect(result.current.mood.label).toBe("sad");
  });

  it("recovers from sad on a plain successful send (not only via retry)", async () => {
    mockSendMessage.mockRejectedValueOnce(new Error("AI unavailable"));
    mockSendMessage.mockResolvedValueOnce({
      userMessage: makeMessage(3, "user", "you ok?"),
      assistantMessage: makeMessage(4, "assistant", "All good now!"),
    });

    const { result } = await renderReadyCompanion();

    act(() => {
      result.current.toggleVoice();
    });
    await waitFor(() => expect(result.current.voiceEnabled).toBe(false));

    await act(async () => {
      await result.current.sendText("hello");
    });
    expect(result.current.mood.label).toBe("sad");

    // The user types a brand-new message instead of tapping retry.
    await act(async () => {
      await result.current.sendText("you ok?");
    });

    expect(result.current.mood.label).toBe("bright");
    expect(result.current.error).toBeNull();
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
    mockCompanionCheckIn.mockResolvedValue({
      ...makeMessage(2, "assistant", "I missed you — how have you been?"),
      reflectionThought: null,
    });

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

describe("CompanionContext bell <-> check-in cadence coupling", () => {
  const mockRequestPermission =
    requestNotificationPermission as jest.MockedFunction<
      typeof requestNotificationPermission
    >;
  const mockCancelNudges = cancelNudges as jest.MockedFunction<
    typeof cancelNudges
  >;
  const mockScheduleNudge = scheduleNudge as jest.MockedFunction<
    typeof scheduleNudge
  >;

  beforeEach(() => {
    mockRequestPermission.mockResolvedValue(true);
    mockCancelNudges.mockResolvedValue(undefined);
    mockScheduleNudge.mockResolvedValue(undefined);
  });

  async function renderWithBellOn() {
    const utils = await renderReadyCompanion();
    await act(async () => {
      await utils.result.current.toggleNotifications();
    });
    expect(utils.result.current.notificationsEnabled).toBe(true);
    return utils;
  }

  it("setting cadence to Off cancels nudges and turns the bell off", async () => {
    const { result } = await renderWithBellOn();
    mockCancelNudges.mockClear();

    await act(async () => {
      await result.current.setCheckInCadence("off");
    });

    expect(result.current.checkInCadence).toBe("off");
    expect(result.current.notificationsEnabled).toBe(false);
    expect(mockCancelNudges).toHaveBeenCalled();
    // The bell-off choice is persisted so it survives a restart.
    expect(await AsyncStorage.getItem("empiri.notificationsEnabled")).toBe(
      "false",
    );
    expect(await AsyncStorage.getItem("empiri.checkInCadence")).toBe("off");
  });

  it("setting cadence to Off cancels nudges even when the bell was already off", async () => {
    const { result } = await renderReadyCompanion();
    expect(result.current.notificationsEnabled).toBe(false);
    mockCancelNudges.mockClear();

    await act(async () => {
      await result.current.setCheckInCadence("off");
    });

    expect(result.current.checkInCadence).toBe("off");
    expect(result.current.notificationsEnabled).toBe(false);
    expect(mockCancelNudges).toHaveBeenCalled();
  });

  it("turning the bell on while cadence is Off restores the default cadence and schedules a nudge", async () => {
    const { result } = await renderReadyCompanion();

    await act(async () => {
      await result.current.setCheckInCadence("off");
    });
    expect(result.current.checkInCadence).toBe("off");
    mockScheduleNudge.mockClear();

    await act(async () => {
      await result.current.toggleNotifications();
    });

    expect(result.current.notificationsEnabled).toBe(true);
    expect(result.current.checkInCadence).toBe(DEFAULT_CADENCE);
    // The restored cadence is persisted, and a nudge is armed at its interval.
    expect(await AsyncStorage.getItem("empiri.checkInCadence")).toBe(
      DEFAULT_CADENCE,
    );
    expect(mockScheduleNudge).toHaveBeenCalled();
  });

  it("turning the bell on with a real cadence keeps that cadence unchanged", async () => {
    const { result } = await renderReadyCompanion();

    await act(async () => {
      await result.current.setCheckInCadence("daily");
    });

    await act(async () => {
      await result.current.toggleNotifications();
    });

    expect(result.current.notificationsEnabled).toBe(true);
    expect(result.current.checkInCadence).toBe("daily");
  });

  it("turning the bell off leaves the cadence untouched", async () => {
    const { result } = await renderWithBellOn();

    await act(async () => {
      await result.current.setCheckInCadence("daily");
    });
    expect(result.current.checkInCadence).toBe("daily");
    mockCancelNudges.mockClear();

    // Bell off.
    await act(async () => {
      await result.current.toggleNotifications();
    });

    expect(result.current.notificationsEnabled).toBe(false);
    expect(result.current.checkInCadence).toBe("daily");
    expect(await AsyncStorage.getItem("empiri.checkInCadence")).toBe("daily");
    // Pending OS nudges are cancelled so nothing fires with the bell off.
    expect(mockCancelNudges).toHaveBeenCalled();
  });

  it("enabling the bell only mutates state after permission is granted", async () => {
    mockRequestPermission.mockResolvedValue(false);
    const { result } = await renderReadyCompanion();

    await act(async () => {
      await result.current.setCheckInCadence("off");
    });

    await act(async () => {
      await result.current.toggleNotifications();
    });

    // Permission denied: nothing flips, the cadence stays off, and the user
    // gets a hint to enable notifications in system settings.
    expect(result.current.notificationsEnabled).toBe(false);
    expect(result.current.checkInCadence).toBe("off");
    expect(await AsyncStorage.getItem("empiri.notificationsEnabled")).not.toBe(
      "true",
    );
    expect(mockScheduleNudge).not.toHaveBeenCalled();
    expect(result.current.error).toMatch(/notifications/i);
  });
});

describe("CompanionContext conversation title persistence", () => {
  const mockGetConversation =
    getConversation as jest.MockedFunction<typeof getConversation>;
  const mockRenameConversation =
    renameConversation as jest.MockedFunction<typeof renameConversation>;

  const CONVERSATION_KEY = "empiri.conversationId";

  it("loads the persisted title from the server on init when a stored conversation id exists", async () => {
    // Simulate a restart: a conversation id is already in AsyncStorage.
    await AsyncStorage.setItem(CONVERSATION_KEY, "7");
    mockListMessages.mockResolvedValue([makeMessage(1, "user", "hi")]);
    mockGetConversation.mockResolvedValue({
      id: 7,
      title: "Late night talks",
      createdAt: new Date("2026-06-12T00:00:00.000Z").toISOString(),
    });

    const { result } = await renderReadyCompanion();

    expect(mockGetConversation).toHaveBeenCalledWith(7);
    expect(result.current.conversationTitle).toBe("Late night talks");
    // No new conversation is created when resuming a stored one.
    expect(mockCreateConversation).not.toHaveBeenCalled();
  });

  it("keeps the default title when loading the persisted title fails", async () => {
    await AsyncStorage.setItem(CONVERSATION_KEY, "7");
    mockGetConversation.mockRejectedValue(new Error("boom"));

    const { result } = await renderReadyCompanion();

    // Title load is best-effort: failure must not block the chat.
    expect(result.current.initializing).toBe(false);
    expect(result.current.conversationTitle).toBe("Empiri");
  });

  it("renameConversation updates the title from the server response", async () => {
    const { result } = await renderReadyCompanion();
    mockRenameConversation.mockResolvedValue({
      id: 1,
      title: "Morning pages",
      createdAt: new Date("2026-06-12T00:00:00.000Z").toISOString(),
    });

    await act(async () => {
      await result.current.renameConversation("  Morning pages  ");
    });

    // The raw input is trimmed before hitting the API, and the state reflects
    // the server's canonical title.
    expect(mockRenameConversation).toHaveBeenCalledWith(1, {
      title: "Morning pages",
    });
    expect(result.current.conversationTitle).toBe("Morning pages");
  });

  it("ignores rename attempts with an empty or whitespace-only title", async () => {
    const { result } = await renderReadyCompanion();

    await act(async () => {
      await result.current.renameConversation("   ");
    });

    expect(mockRenameConversation).not.toHaveBeenCalled();
    expect(result.current.conversationTitle).toBe("Empiri");
  });

  it("resets the title to the default on sign-out", async () => {
    await AsyncStorage.setItem(CONVERSATION_KEY, "7");
    mockGetConversation.mockResolvedValue({
      id: 7,
      title: "Late night talks",
      createdAt: new Date("2026-06-12T00:00:00.000Z").toISOString(),
    });

    const { result } = await renderReadyCompanion();
    expect(result.current.conversationTitle).toBe("Late night talks");

    await act(async () => {
      await result.current.signOut();
    });

    expect(result.current.conversationTitle).toBe("Empiri");
    // The stored pointer is cleared so the next account can't inherit it.
    expect(await AsyncStorage.getItem(CONVERSATION_KEY)).toBeNull();
  });
});

describe("CompanionContext stale conversation pointer recovery", () => {
  const CONVERSATION_KEY = "empiri.conversationId";
  const mockListConversations =
    listConversations as jest.MockedFunction<typeof listConversations>;

  beforeEach(async () => {
    await AsyncStorage.clear();
  });

  afterEach(async () => {
    await AsyncStorage.clear();
  });

  it("silently resumes an existing server conversation when the stored id returns 404", async () => {
    // The device has a stale pointer (id 99) that no longer exists on the server.
    await AsyncStorage.setItem(CONVERSATION_KEY, "99");

    // First listMessages call (for the stale id) — signals the id is gone.
    const notFound = Object.assign(new Error("Not Found"), { status: 404 });
    mockListMessages
      .mockRejectedValueOnce(notFound)
      // Second call: loading history for the resumed conversation.
      .mockResolvedValueOnce([makeMessage(10, "user", "old message")]);

    // The account still has a valid conversation on the server.
    mockListConversations.mockResolvedValue([
      {
        id: 5,
        title: "Restored chat",
        createdAt: new Date("2026-06-12T00:00:00.000Z").toISOString(),
      },
    ]);

    const { result } = await renderReadyCompanion();

    // The app recovers without an error screen.
    expect(result.current.initializing).toBe(false);
    expect(result.current.initError).toBeNull();

    // The active conversation is now the one from the server.
    expect(result.current.conversationId).toBe(5);

    // AsyncStorage now points at the valid id so the next restart is fast.
    expect(await AsyncStorage.getItem(CONVERSATION_KEY)).toBe("5");

    // createConversation must NOT have been called — we resumed an existing one.
    expect(mockCreateConversation).not.toHaveBeenCalled();

    // History from the resumed conversation is loaded.
    expect(result.current.messages.some((m) => m.content === "old message")).toBe(true);
  });

  it("creates a fresh conversation when the stored id 404s and the account has no conversations", async () => {
    // The device has a stale pointer (id 99).
    await AsyncStorage.setItem(CONVERSATION_KEY, "99");

    // listMessages for the stale id → 404.
    const notFound = Object.assign(new Error("Not Found"), { status: 404 });
    mockListMessages.mockRejectedValueOnce(notFound);

    // The account has no conversations at all.
    mockListConversations.mockResolvedValue([]);

    // The new conversation the server creates.
    mockCreateConversation.mockResolvedValue({
      id: 42,
      title: "Empiri",
      createdAt: new Date("2026-06-12T00:00:00.000Z").toISOString(),
    });

    const { result } = await renderReadyCompanion();

    // The app recovers without an error screen.
    expect(result.current.initializing).toBe(false);
    expect(result.current.initError).toBeNull();

    // createConversation was called because there was nothing to resume.
    expect(mockCreateConversation).toHaveBeenCalledTimes(1);

    // The context points at the freshly created conversation.
    expect(result.current.conversationId).toBe(42);

    // The new id is persisted so the next cold start finds a valid pointer.
    expect(await AsyncStorage.getItem(CONVERSATION_KEY)).toBe("42");
  });
});
