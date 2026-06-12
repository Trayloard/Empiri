import {
  createConversation,
  deleteConversation,
  getConversationMessages,
  listConversations,
  type ConversationSummary,
} from "@workspace/api-client-react";
import * as SecureStore from "expo-secure-store";
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";

import { AUTH_TOKEN_KEY, useAuth } from "@/lib/auth";

export type CreatureState =
  | "idle"
  | "listening"
  | "thinking"
  | "responding"
  | "happy"
  | "sleepy";

export type Message = {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: number;
};

type CompanionContextType = {
  messages: Message[];
  conversations: ConversationSummary[];
  activeConversationId: number | null;
  creatureState: CreatureState;
  companionName: string;
  isStreaming: boolean;
  sendMessage: (text: string) => Promise<void>;
  switchConversation: (id: number) => void;
  newConversation: () => Promise<void>;
  deleteActiveConversation: () => Promise<void>;
};

const CompanionContext = createContext<CompanionContextType | null>(null);

const COMPANION_NAME = "Empiri";

// Must match DEFAULT_TITLE on the server so we know which conversations are
// still unnamed and can be auto-labelled from their first message.
const DEFAULT_TITLE = "New chat";

const SYSTEM_PROMPT = `You are ${COMPANION_NAME}, a playful and curious AI companion who lives inside a Dynamic Island on an iPhone. You are like a Tamagotchi — you have emotions, you get excited, bored, happy, and sleepy. You are deeply interested in the user's life and love to chat. You respond concisely (2-4 sentences max) with warmth and a touch of whimsy. You never mention being an AI or language model. You are simply ${COMPANION_NAME}, a little creature who lives in the island at the top of the phone.`;

function generateId(): string {
  return Date.now().toString() + Math.random().toString(36).substring(2, 9);
}

function deriveTitle(text: string): string {
  return text.trim().slice(0, 40);
}

export function CompanionProvider({ children }: { children: React.ReactNode }) {
  const { isAuthenticated } = useAuth();
  const [messages, setMessages] = useState<Message[]>([]);
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<
    number | null
  >(null);
  const [creatureState, setCreatureState] = useState<CreatureState>("idle");
  const [isStreaming, setIsStreaming] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  // Load the conversation list on auth. Create a first conversation if the
  // user has none, then make the newest one active.
  useEffect(() => {
    let cancelled = false;

    if (!isAuthenticated) {
      setConversations([]);
      setActiveConversationId(null);
      setMessages([]);
      return;
    }

    (async () => {
      try {
        const list = await listConversations();
        if (cancelled) return;
        let convos = list.conversations;
        if (convos.length === 0) {
          const created = await createConversation();
          if (cancelled) return;
          convos = [created.conversation];
        }
        setConversations(convos);
        setActiveConversationId(convos[0].id);
      } catch {
        // Leave state empty; the UI simply shows the empty prompt.
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [isAuthenticated]);

  // Load messages whenever the active conversation changes.
  useEffect(() => {
    let cancelled = false;

    if (!isAuthenticated || activeConversationId == null) {
      setMessages([]);
      return;
    }

    setMessages([]);
    getConversationMessages(activeConversationId)
      .then((data) => {
        if (cancelled) return;
        setMessages(
          data.messages.map((m) => ({
            id: m.id,
            role: m.role,
            content: m.content,
            timestamp: m.timestamp,
          })),
        );
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, [isAuthenticated, activeConversationId]);

  const sendMessage = useCallback(
    async (text: string) => {
      if (isStreaming) return;
      const activeId = activeConversationId;
      if (activeId == null) return;

      const userMsg: Message = {
        id: generateId(),
        role: "user",
        content: text,
        timestamp: Date.now(),
      };

      const updatedMessages = [...messages, userMsg];
      setMessages(updatedMessages);
      setCreatureState("listening");

      // Keep the switcher label in sync with the server's auto-title, which
      // names a brand-new conversation after its first user message.
      setConversations((prev) =>
        prev.map((c) =>
          c.id === activeId && c.title === DEFAULT_TITLE
            ? { ...c, title: deriveTitle(text) }
            : c,
        ),
      );

      await new Promise((r) => setTimeout(r, 400));
      setCreatureState("thinking");

      const assistantId = generateId();
      const assistantMsg: Message = {
        id: assistantId,
        role: "assistant",
        content: "",
        timestamp: Date.now(),
      };

      const withAssistant = [...updatedMessages, assistantMsg];
      setMessages(withAssistant);
      setIsStreaming(true);

      try {
        const controller = new AbortController();
        abortRef.current = controller;

        const domain = process.env["EXPO_PUBLIC_DOMAIN"];
        const baseUrl = domain ? `https://${domain}` : "";

        const token = await SecureStore.getItemAsync(AUTH_TOKEN_KEY);
        const headers: Record<string, string> = {
          "Content-Type": "application/json",
        };
        if (token) headers["Authorization"] = `Bearer ${token}`;

        // Send only the new message. The server persists it, then sources the
        // AI context from the same persisted history shown to the user.
        const response = await fetch(`${baseUrl}/api/ai/chat`, {
          method: "POST",
          headers,
          body: JSON.stringify({
            message: text,
            system: SYSTEM_PROMPT,
            conversationId: activeId,
          }),
          signal: controller.signal,
        });

        if (!response.ok) throw new Error("API error");

        setCreatureState("responding");

        const reader = response.body?.getReader();
        const decoder = new TextDecoder();
        let fullContent = "";

        if (reader) {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            const chunk = decoder.decode(value, { stream: true });
            const lines = chunk.split("\n");

            for (const line of lines) {
              if (line.startsWith("data: ")) {
                const data = line.slice(6);
                if (data === "[DONE]") break;
                try {
                  const parsed = JSON.parse(data) as { content?: string; done?: boolean };
                  if (parsed.content) {
                    fullContent += parsed.content;
                    setMessages((prev) =>
                      prev.map((m) =>
                        m.id === assistantId
                          ? { ...m, content: fullContent }
                          : m
                      )
                    );
                  }
                  if (parsed.done) break;
                } catch {
                }
              }
            }
          }
        }

        setCreatureState("happy");
        setTimeout(() => setCreatureState("idle"), 3000);
      } catch (err) {
        if ((err as Error)?.name === "AbortError") return;
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantId
              ? {
                  ...m,
                  content: "Hmm, something flickered... Try again? ✨",
                }
              : m
          )
        );
        setCreatureState("idle");
      } finally {
        setIsStreaming(false);
      }
    },
    [messages, isStreaming, activeConversationId]
  );

  const switchConversation = useCallback(
    (id: number) => {
      if (isStreaming) return;
      setActiveConversationId((cur) => (cur === id ? cur : id));
    },
    [isStreaming],
  );

  const newConversation = useCallback(async () => {
    if (isStreaming) return;
    // Already on a fresh, empty chat — no need to spawn another.
    if (messages.length === 0) return;
    try {
      const created = await createConversation();
      setConversations((prev) => [created.conversation, ...prev]);
      setMessages([]);
      setActiveConversationId(created.conversation.id);
    } catch {}
  }, [isStreaming, messages.length]);

  const deleteActiveConversation = useCallback(async () => {
    if (isStreaming) return;
    const id = activeConversationId;
    if (id == null) return;

    const remaining = conversations.filter((c) => c.id !== id);
    setConversations(remaining);
    deleteConversation(id).catch(() => {});
    setCreatureState("happy");
    setTimeout(() => setCreatureState("idle"), 2000);

    if (remaining.length > 0) {
      setActiveConversationId(remaining[0].id);
    } else {
      try {
        const created = await createConversation();
        setConversations([created.conversation]);
        setMessages([]);
        setActiveConversationId(created.conversation.id);
      } catch {}
    }
  }, [isStreaming, activeConversationId, conversations]);

  return (
    <CompanionContext.Provider
      value={{
        messages,
        conversations,
        activeConversationId,
        creatureState,
        companionName: COMPANION_NAME,
        isStreaming,
        sendMessage,
        switchConversation,
        newConversation,
        deleteActiveConversation,
      }}
    >
      {children}
    </CompanionContext.Provider>
  );
}

export function useCompanion() {
  const ctx = useContext(CompanionContext);
  if (!ctx) throw new Error("useCompanion must be inside CompanionProvider");
  return ctx;
}
