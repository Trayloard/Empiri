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
 * Regression coverage for the multi-chat switcher, focused on chat isolation:
 * a reply (or failure) that resolves AFTER the user has switched to another
 * conversation must never leak into the newly opened chat's messages, error
 * banner, or retry state.
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

// Shared manual mock: see artifacts/mobile/__mocks__/@workspace/api-client-react.ts
jest.mock("@workspace/api-client-react");

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
const mockGetConversation =
  getConversation as jest.MockedFunction<typeof getConversation>;
const mockListConversations =
  listConversations as jest.MockedFunction<typeof listConversations>;
const mockListMessages =
  listMessages as jest.MockedFunction<typeof listMessages>;
const mockSendMessage = sendMessage as jest.MockedFunction<typeof sendMessage>;

const CREATED_AT = new Date("2026-07-01T00:00:00.000Z").toISOString();

function makeConversation(id: number, title: string): Conversation {
  return { id, title, createdAt: CREATED_AT, lastMessageText: null, lastMessageAt: null };
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
const chatBHistory = [makeMessage(20, 2, "assistant", "Welcome to chat B")];

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
  // Account owns two chats; the provider resumes the first one.
  mockListConversations.mockResolvedValue([chatA, chatB]);
  mockListMessages.mockImplementation(async (id: number) =>
    id === chatB.id ? chatBHistory : [],
  );
  mockGetConversation.mockImplementation(async (id: number) =>
    id === chatB.id ? chatB : chatA,
  );
});

describe("chat switching", () => {
  it("openConversation loads the target chat's history and title", async () => {
    const { result } = await renderReadyCompanion();
    expect(result.current.conversationId).toBe(chatA.id);
    expect(result.current.chats).toHaveLength(2);

    await act(async () => {
      await result.current.openConversation(chatB.id);
    });

    expect(result.current.conversationId).toBe(chatB.id);
    expect(result.current.conversationTitle).toBe("Chat B");
    expect(result.current.messages).toEqual(chatBHistory);
    expect(await AsyncStorage.getItem("empiri.conversationId")).toBe("2");
  });

  it("startNewChat creates a fresh empty conversation and adds it to the list", async () => {
    const fresh = makeConversation(3, "New chat");
    mockCreateConversation.mockResolvedValue(fresh);

    const { result } = await renderReadyCompanion();
    await act(async () => {
      await result.current.startNewChat();
    });

    expect(result.current.conversationId).toBe(3);
    expect(result.current.conversationTitle).toBe("New chat");
    expect(result.current.messages).toEqual([]);
    expect(result.current.chats.map((c) => c.id)).toEqual([1, 2, 3]);
  });

  it("a reply that resolves after switching chats never lands in the new chat", async () => {
    // Chat A's reply hangs until we release it — after the switch to chat B.
    let releaseReply!: (value: {
      userMessage: Message;
      assistantMessage: Message;
    }) => void;
    mockSendMessage.mockReturnValue(
      new Promise((resolve) => {
        releaseReply = resolve;
      }),
    );

    const { result } = await renderReadyCompanion();
    act(() => {
      result.current.toggleVoice();
    });
    await waitFor(() => expect(result.current.voiceEnabled).toBe(false));

    let sendPromise: Promise<void>;
    act(() => {
      sendPromise = result.current.sendText("hello from A");
    });
    await waitFor(() => expect(result.current.status).toBe("thinking"));

    // Switch to chat B while A's reply is still in flight.
    await act(async () => {
      await result.current.openConversation(chatB.id);
    });
    expect(result.current.messages).toEqual(chatBHistory);
    expect(result.current.status).toBe("idle");

    // Chat A's reply arrives late.
    await act(async () => {
      releaseReply({
        userMessage: makeMessage(10, 1, "user", "hello from A"),
        assistantMessage: makeMessage(11, 1, "assistant", "reply for A"),
      });
      await sendPromise;
    });

    // Chat B stays untouched: no A messages, no status clobber.
    expect(result.current.messages).toEqual(chatBHistory);
    expect(result.current.status).toBe("idle");
  });

  it("switching back to A after visiting B shows A's messages again", async () => {
    const chatAHistory = [makeMessage(5, 1, "user", "message from A")];
    // Return A's history for id=1, B's history for id=2
    mockListMessages.mockImplementation(async (id: number) => {
      if (id === chatA.id) return chatAHistory;
      if (id === chatB.id) return chatBHistory;
      return [];
    });

    const { result } = await renderReadyCompanion();
    expect(result.current.conversationId).toBe(chatA.id);

    // Switch A → B
    await act(async () => {
      await result.current.openConversation(chatB.id);
    });
    expect(result.current.messages).toEqual(chatBHistory);

    // Switch back B → A
    await act(async () => {
      await result.current.openConversation(chatA.id);
    });
    expect(result.current.conversationId).toBe(chatA.id);
    expect(result.current.conversationTitle).toBe("Chat A");
    expect(result.current.messages).toEqual(chatAHistory);
    // None of B's messages bleed through
    expect(
      result.current.messages.some((m) =>
        chatBHistory.some((b) => b.id === m.id),
      ),
    ).toBe(false);
  });

  it("a slow openConversation(A) that resolves after openConversation(B) never overwrites B's messages", async () => {
    // Use a three-chat setup: the initial chat is chatC, then the user rapidly
    // taps A (slow) then B (fast) before A's fetch completes.
    const chatC = makeConversation(3, "Chat C");
    mockListConversations.mockResolvedValue([chatC, chatA, chatB]);

    // listMessages(A) is held; listMessages(B) resolves immediately.
    let releaseA!: (msgs: Message[]) => void;
    mockListMessages.mockImplementation(async (id: number) => {
      if (id === chatA.id) {
        return new Promise<Message[]>((resolve) => {
          releaseA = resolve;
        });
      }
      if (id === chatB.id) return chatBHistory;
      return [];
    });
    mockGetConversation.mockImplementation(async (id: number) => {
      if (id === chatA.id) return chatA;
      if (id === chatB.id) return chatB;
      return chatC;
    });

    const { result } = await renderReadyCompanion();
    expect(result.current.conversationId).toBe(chatC.id);

    // Kick off openConversation(A) — its listMessages is blocked.
    let openAPromise: Promise<void>;
    act(() => {
      openAPromise = result.current.openConversation(chatA.id);
    });

    // Immediately open B — this resolves quickly and becomes the "desired" chat.
    await act(async () => {
      await result.current.openConversation(chatB.id);
    });
    expect(result.current.conversationId).toBe(chatB.id);
    expect(result.current.messages).toEqual(chatBHistory);

    // Now let A's slow fetch complete.
    await act(async () => {
      releaseA([makeMessage(99, chatA.id, "user", "late message from A")]);
      await openAPromise;
    });

    // B must still be shown — the late A result is discarded.
    expect(result.current.conversationId).toBe(chatB.id);
    expect(result.current.messages).toEqual(chatBHistory);
    expect(
      result.current.messages.some((m) => m.content === "late message from A"),
    ).toBe(false);
  });

  it("a failure from the previous chat surfaces no error or retry in the new chat", async () => {
    let rejectReply!: (err: Error) => void;
    mockSendMessage.mockReturnValue(
      new Promise((_resolve, reject) => {
        rejectReply = reject;
      }),
    );

    const { result } = await renderReadyCompanion();
    act(() => {
      result.current.toggleVoice();
    });
    await waitFor(() => expect(result.current.voiceEnabled).toBe(false));

    let sendPromise: Promise<void>;
    act(() => {
      sendPromise = result.current.sendText("doomed message");
    });
    await waitFor(() => expect(result.current.status).toBe("thinking"));

    await act(async () => {
      await result.current.openConversation(chatB.id);
    });

    await act(async () => {
      rejectReply(new Error("network down"));
      await sendPromise;
    });

    expect(result.current.error).toBeNull();
    expect(result.current.failedTurn).toBeNull();
    expect(result.current.messages).toEqual(chatBHistory);
  });
});
