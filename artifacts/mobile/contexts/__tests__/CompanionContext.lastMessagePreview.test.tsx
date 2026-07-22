import React from "react";
import { act, renderHook, waitFor } from "@testing-library/react-native";

import AsyncStorage from "@react-native-async-storage/async-storage";

import {
  createConversation,
  getConversation,
  listConversations,
  listMessages,
  sendMessage,
  type Conversation,
  type Message,
} from "@workspace/api-client-react";

import { CompanionProvider, useCompanion } from "../CompanionContext";

/**
 * Coverage for Task #144: last-message preview in the chat switcher.
 *
 * Scenarios:
 *  1. Conversations loaded from the server expose lastMessageText/At in `chats`.
 *  2. A successful sendText updates the active chat's lastMessageText/At locally
 *     so the switcher reflects the most recent reply without a full refresh.
 *  3. Conversations with null lastMessageText are preserved as-is.
 *  4. A stale reply (conversation switched away) does NOT update the chats list.
 */

jest.mock("@react-native-async-storage/async-storage", () =>
  require("@react-native-async-storage/async-storage/jest/async-storage-mock"),
);

jest.mock("expo-audio", () => ({
  RecordingPresets: { HIGH_QUALITY: {}, LOW_QUALITY: {} },
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

jest.mock("@workspace/api-client-react");

jest.mock("@/lib/auth", () => ({
  AuthProvider: ({ children }: { children: React.ReactNode }) => children,
  useAuth: () => ({
    user: { id: "u1", email: null, firstName: null, lastName: null, profileImageUrl: null },
    isLoading: false,
    isAuthenticated: true,
    login: jest.fn(),
    logout: jest.fn(),
  }),
}));

jest.mock("@/lib/notifications", () => ({
  cancelNudges: jest.fn().mockResolvedValue(undefined),
  requestNotificationPermission: jest.fn().mockResolvedValue(true),
  scheduleNudge: jest.fn().mockResolvedValue(undefined),
  scheduleNudgeInSeconds: jest.fn().mockResolvedValue(undefined),
}));

const mockListConversations = listConversations as jest.MockedFunction<typeof listConversations>;
const mockListMessages = listMessages as jest.MockedFunction<typeof listMessages>;
const mockGetConversation = getConversation as jest.MockedFunction<typeof getConversation>;
const mockCreateConversation = createConversation as jest.MockedFunction<typeof createConversation>;
const mockSendMessage = sendMessage as jest.MockedFunction<typeof sendMessage>;

const BASE_AT = "2026-07-01T00:00:00.000Z";
const MSG_AT = "2026-07-01T12:00:00.000Z";

function makeConversation(
  id: number,
  title: string,
  lastMessageText: string | null = null,
  lastMessageAt: string | null = null,
): Conversation {
  return { id, title, createdAt: BASE_AT, lastMessageText, lastMessageAt };
}

function makeMessage(
  id: number,
  conversationId: number,
  role: Message["role"],
  content: string,
  createdAt = BASE_AT,
): Message {
  return { id, conversationId, role, content, createdAt };
}

function wrapper({ children }: { children: React.ReactNode }) {
  return <CompanionProvider>{children}</CompanionProvider>;
}

async function renderReadyCompanion() {
  const utils = renderHook(() => useCompanion(), { wrapper });
  await waitFor(() => expect(utils.result.current.initializing).toBe(false));
  return utils;
}

const chatA = makeConversation(1, "Chat A", "Hello from A", MSG_AT);
const chatB = makeConversation(2, "Chat B", null, null);
const chatAHistory = [makeMessage(10, 1, "assistant", "Hello from A", MSG_AT)];

beforeEach(async () => {
  jest.clearAllMocks();
  await AsyncStorage.clear();

  mockListConversations.mockResolvedValue([chatA, chatB]);
  mockListMessages.mockImplementation(async (id: number) => {
    if (id === chatA.id) return chatAHistory;
    return [];
  });
  mockGetConversation.mockImplementation(async (id: number) => {
    if (id === chatA.id) return chatA;
    if (id === chatB.id) return chatB;
    throw new Error("not found");
  });
  mockCreateConversation.mockResolvedValue(
    makeConversation(99, "New chat"),
  );
});

describe("lastMessagePreview", () => {
  it("exposes lastMessageText and lastMessageAt from the server on load", async () => {
    const { result } = await renderReadyCompanion();

    const a = result.current.chats.find((c) => c.id === chatA.id)!;
    expect(a.lastMessageText).toBe("Hello from A");
    expect(a.lastMessageAt).toBe(MSG_AT);

    const b = result.current.chats.find((c) => c.id === chatB.id)!;
    expect(b.lastMessageText).toBeNull();
    expect(b.lastMessageAt).toBeNull();
  });

  it("updates the active chat's lastMessageText/At after a successful send", async () => {
    const replyAt = "2026-07-22T10:00:00.000Z";
    const replyContent = "Hi there, I am Empiri!";

    mockSendMessage.mockResolvedValue({
      userMessage: makeMessage(11, chatA.id, "user", "hey", BASE_AT),
      assistantMessage: makeMessage(12, chatA.id, "assistant", replyContent, replyAt),
    });

    const { result } = await renderReadyCompanion();
    expect(result.current.conversationId).toBe(chatA.id);

    await act(async () => {
      await result.current.sendText("hey");
    });

    const a = result.current.chats.find((c) => c.id === chatA.id)!;
    expect(a.lastMessageText).toBe(replyContent);
    expect(a.lastMessageAt).toBe(replyAt);

    // Other chats remain unaffected.
    const b = result.current.chats.find((c) => c.id === chatB.id)!;
    expect(b.lastMessageText).toBeNull();
  });

  it("does NOT update chats when the reply arrives after a chat switch", async () => {
    let resolveMsg!: (v: { userMessage: Message; assistantMessage: Message }) => void;
    const blockedSend = new Promise<{ userMessage: Message; assistantMessage: Message }>(
      (res) => { resolveMsg = res; },
    );
    mockSendMessage.mockReturnValue(blockedSend);

    const { result } = await renderReadyCompanion();
    expect(result.current.conversationId).toBe(chatA.id);

    // Start a send from chat A — it's in flight.
    let sendPromise!: Promise<void>;
    act(() => {
      sendPromise = result.current.sendText("hello");
    });

    // Switch to chat B before the reply arrives.
    await act(async () => {
      await result.current.openConversation(chatB.id);
    });
    expect(result.current.conversationId).toBe(chatB.id);

    const chatBTextBefore = result.current.chats.find((c) => c.id === chatB.id)!.lastMessageText;

    // Now resolve the blocked send from chat A.
    act(() => {
      resolveMsg({
        userMessage: makeMessage(11, chatA.id, "user", "hello", BASE_AT),
        assistantMessage: makeMessage(12, chatA.id, "assistant", "stale reply", BASE_AT),
      });
    });
    await act(async () => { await sendPromise; });

    // Chat B must not have been polluted by chat A's reply.
    const b = result.current.chats.find((c) => c.id === chatB.id)!;
    expect(b.lastMessageText).toBe(chatBTextBefore);

    // deliver() returns early for stale requests, so chat A's preview in the
    // switcher is also left unchanged (it will be refreshed on the next open).
    const a = result.current.chats.find((c) => c.id === chatA.id)!;
    expect(a.lastMessageText).toBe(chatA.lastMessageText);
  });
});
