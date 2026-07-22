import React from "react";
import { act, renderHook, waitFor } from "@testing-library/react-native";

import AsyncStorage from "@react-native-async-storage/async-storage";

import {
  createConversation,
  deleteConversation,
  getConversation,
  listConversations,
  listMessages,
  type Conversation,
  type Message,
} from "@workspace/api-client-react";

import { CompanionProvider, useCompanion } from "../CompanionContext";

/**
 * Regression coverage for the "delete chat" feature.
 *
 * Scenarios covered:
 *  1. Deleting an inactive chat removes it from the list; active chat unchanged.
 *  2. Deleting the active chat switches to the most-recent remaining chat.
 *  3. Deleting the last chat creates a brand-new conversation.
 *  4. An API error propagates so the UI can show it.
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

const mockDeleteConversation =
  deleteConversation as jest.MockedFunction<typeof deleteConversation>;
const mockCreateConversation =
  createConversation as jest.MockedFunction<typeof createConversation>;
const mockGetConversation =
  getConversation as jest.MockedFunction<typeof getConversation>;
const mockListConversations =
  listConversations as jest.MockedFunction<typeof listConversations>;
const mockListMessages =
  listMessages as jest.MockedFunction<typeof listMessages>;

const CREATED_AT = new Date("2026-07-01T00:00:00.000Z").toISOString();

function makeConversation(id: number, title: string): Conversation {
  return { id, title, createdAt: CREATED_AT };
}

function makeMessage(
  id: number,
  conversationId: number,
  role: Message["role"],
  content: string,
): Message {
  return { id, conversationId, role, content, createdAt: CREATED_AT };
}

const chatA = makeConversation(1, "Chat A");
const chatB = makeConversation(2, "Chat B");
const chatC = makeConversation(3, "Chat C");

const chatAHistory = [makeMessage(10, 1, "user", "hello from A")];
const chatCHistory = [makeMessage(30, 3, "user", "hello from C")];

function wrapper({ children }: { children: React.ReactNode }) {
  return <CompanionProvider>{children}</CompanionProvider>;
}

async function renderReadyCompanion() {
  const utils = renderHook(() => useCompanion(), { wrapper });
  await waitFor(() => expect(utils.result.current.initializing).toBe(false));
  return utils;
}

beforeEach(async () => {
  jest.clearAllMocks();
  await AsyncStorage.clear();

  // Default: A is active (first in list), B is another chat.
  mockListConversations.mockResolvedValue([chatA, chatB]);
  mockListMessages.mockImplementation(async (id: number) => {
    if (id === chatA.id) return chatAHistory;
    return [];
  });
  mockGetConversation.mockImplementation(async (id: number) => {
    if (id === chatA.id) return chatA;
    if (id === chatB.id) return chatB;
    if (id === chatC.id) return chatC;
    throw new Error("not found");
  });
  // deleteConversation resolves by default (success)
  mockDeleteConversation.mockResolvedValue(undefined);
});

describe("deleteConversation", () => {
  it("deleting an inactive chat removes it from the list without touching the active chat", async () => {
    const { result } = await renderReadyCompanion();
    expect(result.current.conversationId).toBe(chatA.id);
    expect(result.current.chats).toHaveLength(2);

    await act(async () => {
      await result.current.deleteConversation(chatB.id);
    });

    // B is gone from the list.
    expect(result.current.chats.map((c) => c.id)).toEqual([chatA.id]);
    // Active chat (A) is untouched.
    expect(result.current.conversationId).toBe(chatA.id);
    expect(result.current.messages).toEqual(chatAHistory);
  });

  it("deleting the active chat switches to the most-recent remaining chat", async () => {
    // Three chats: A (oldest, active), B, C (newest).
    mockListConversations.mockResolvedValue([chatA, chatB, chatC]);
    mockListMessages.mockImplementation(async (id: number) => {
      if (id === chatA.id) return chatAHistory;
      if (id === chatC.id) return chatCHistory;
      return [];
    });

    const { result } = await renderReadyCompanion();
    expect(result.current.conversationId).toBe(chatA.id);

    await act(async () => {
      await result.current.deleteConversation(chatA.id);
    });

    // A is removed from the list.
    expect(result.current.chats.map((c) => c.id)).not.toContain(chatA.id);
    // Context switches to the newest remaining chat (C).
    expect(result.current.conversationId).toBe(chatC.id);
    expect(result.current.conversationTitle).toBe("Chat C");
    expect(result.current.messages).toEqual(chatCHistory);
    // AsyncStorage is updated to point at C.
    expect(await AsyncStorage.getItem("empiri.conversationId")).toBe(
      String(chatC.id),
    );
  });

  it("deleting the last chat creates a brand-new conversation", async () => {
    // Only one chat; it's the active one.
    mockListConversations.mockResolvedValue([chatA]);
    const fresh = makeConversation(99, "Empiri");
    mockCreateConversation.mockResolvedValue(fresh);

    const { result } = await renderReadyCompanion();
    expect(result.current.conversationId).toBe(chatA.id);

    await act(async () => {
      await result.current.deleteConversation(chatA.id);
    });

    // Old chat gone; a brand-new one took its place.
    expect(result.current.chats).toHaveLength(1);
    expect(result.current.chats[0].id).toBe(fresh.id);
    expect(result.current.conversationId).toBe(fresh.id);
    expect(result.current.conversationTitle).toBe("Empiri");
    expect(result.current.messages).toEqual([]);
    expect(await AsyncStorage.getItem("empiri.conversationId")).toBe(
      String(fresh.id),
    );
  });

  it("an API error propagates so the caller can surface it", async () => {
    mockDeleteConversation.mockRejectedValue(new Error("server error"));

    const { result } = await renderReadyCompanion();
    const chatsBefore = result.current.chats.map((c) => c.id);

    await expect(
      act(async () => {
        await result.current.deleteConversation(chatA.id);
      }),
    ).rejects.toThrow("server error");

    // Nothing changed in state.
    expect(result.current.chats.map((c) => c.id)).toEqual(chatsBefore);
    expect(result.current.conversationId).toBe(chatA.id);
  });
});
