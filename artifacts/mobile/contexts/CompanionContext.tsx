import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  createConversation,
  listMessages,
  sendMessage,
  synthesizeSpeech,
  transcribeAudio,
  type Message,
} from "@workspace/api-client-react";
import {
  AudioModule,
  RecordingPresets,
  createAudioPlayer,
  setAudioModeAsync,
  useAudioRecorder,
} from "expo-audio";
import * as FileSystem from "expo-file-system/legacy";
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { Platform } from "react-native";

export type CompanionStatus =
  | "idle"
  | "thinking"
  | "listening"
  | "transcribing"
  | "speaking";

interface CompanionContextValue {
  messages: Message[];
  status: CompanionStatus;
  voiceEnabled: boolean;
  initializing: boolean;
  initError: string | null;
  error: string | null;
  isRecording: boolean;
  sendText: (content: string) => Promise<void>;
  startListening: () => Promise<void>;
  stopListening: () => Promise<void>;
  toggleVoice: () => void;
  retryInit: () => void;
  dismissError: () => void;
}

const CompanionContext = createContext<CompanionContextValue | undefined>(
  undefined,
);

const CONVERSATION_KEY = "empiri.conversationId";
const VOICE_KEY = "empiri.voiceEnabled";

function tempId(): number {
  return -Math.floor(Math.random() * 1_000_000_000);
}

export function CompanionProvider({ children }: { children: React.ReactNode }) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [status, setStatus] = useState<CompanionStatus>("idle");
  const [voiceEnabled, setVoiceEnabled] = useState<boolean>(true);
  const [initializing, setInitializing] = useState<boolean>(true);
  const [initError, setInitError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isRecording, setIsRecording] = useState<boolean>(false);

  const conversationIdRef = useRef<number | null>(null);
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);

  const initialize = useCallback(async () => {
    setInitializing(true);
    setInitError(null);
    try {
      const storedVoice = await AsyncStorage.getItem(VOICE_KEY);
      if (storedVoice !== null) setVoiceEnabled(storedVoice === "true");

      const storedId = await AsyncStorage.getItem(CONVERSATION_KEY);
      if (storedId) {
        const id = Number(storedId);
        conversationIdRef.current = id;
        const existing = await listMessages(id);
        setMessages(existing);
      } else {
        const conversation = await createConversation({ title: "Empiri" });
        conversationIdRef.current = conversation.id;
        await AsyncStorage.setItem(CONVERSATION_KEY, String(conversation.id));
        setMessages([]);
      }
    } catch {
      setInitError("Couldn't reach Empiri. Check your connection and retry.");
    } finally {
      setInitializing(false);
    }
  }, []);

  useEffect(() => {
    initialize();
  }, [initialize]);

  const playSpeech = useCallback(async (text: string) => {
    try {
      const { audio } = await synthesizeSpeech({ text });
      const path = `${FileSystem.cacheDirectory}empiri-${Date.now()}.mp3`;
      await FileSystem.writeAsStringAsync(path, audio, {
        encoding: FileSystem.EncodingType.Base64,
      });
      await setAudioModeAsync({
        allowsRecording: false,
        playsInSilentMode: true,
      });
      const player = createAudioPlayer({ uri: path });
      player.play();
      await new Promise<void>((resolve) => {
        const sub = player.addListener("playbackStatusUpdate", (s) => {
          if (s.didJustFinish) {
            sub.remove();
            player.remove();
            FileSystem.deleteAsync(path, { idempotent: true }).catch(() => {});
            resolve();
          }
        });
      });
    } catch {
      // Speech is best-effort; the text reply is already shown.
    }
  }, []);

  const refresh = useCallback(async () => {
    const id = conversationIdRef.current;
    if (id == null) return;
    try {
      const latest = await listMessages(id);
      setMessages(latest);
    } catch {
      // ignore — keep optimistic state
    }
  }, []);

  const sendText = useCallback(
    async (raw: string) => {
      const content = raw.trim();
      const id = conversationIdRef.current;
      if (!content || id == null) return;

      const optimistic: Message = {
        id: tempId(),
        conversationId: id,
        role: "user",
        content,
        createdAt: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, optimistic]);
      setError(null);
      setStatus("thinking");

      try {
        const result = await sendMessage(id, { content });
        setMessages((prev) => [
          ...prev.filter((m) => m.id !== optimistic.id),
          result.userMessage,
          result.assistantMessage,
        ]);

        if (voiceEnabled) {
          setStatus("speaking");
          await playSpeech(result.assistantMessage.content);
        }
      } catch {
        setError("Empiri couldn't reply just now. Try again.");
        await refresh();
      } finally {
        setStatus("idle");
      }
    },
    [voiceEnabled, playSpeech, refresh],
  );

  const startListening = useCallback(async () => {
    if (conversationIdRef.current == null) return;
    try {
      const permission = await AudioModule.requestRecordingPermissionsAsync();
      if (!permission.granted) {
        setError("Microphone access is needed to talk to Empiri.");
        return;
      }
      await setAudioModeAsync({
        allowsRecording: true,
        playsInSilentMode: true,
      });
      await recorder.prepareToRecordAsync();
      recorder.record();
      setError(null);
      setIsRecording(true);
      setStatus("listening");
    } catch {
      setError("Couldn't start recording. Try again.");
      setIsRecording(false);
      setStatus("idle");
    }
  }, [recorder]);

  const stopListening = useCallback(async () => {
    if (!isRecording) return;
    setIsRecording(false);
    setStatus("transcribing");
    try {
      await recorder.stop();
      const uri = recorder.uri;
      if (!uri) {
        setStatus("idle");
        return;
      }
      const base64 = await FileSystem.readAsStringAsync(uri, {
        encoding: FileSystem.EncodingType.Base64,
      });
      const format = Platform.OS === "ios" ? "m4a" : "m4a";
      const { text } = await transcribeAudio({ audio: base64, format });
      if (!text.trim()) {
        setError("I didn't catch that. Try again.");
        setStatus("idle");
        return;
      }
      await sendText(text);
    } catch {
      setError("Couldn't understand the recording. Try again.");
      setStatus("idle");
    }
  }, [isRecording, recorder, sendText]);

  const toggleVoice = useCallback(() => {
    setVoiceEnabled((prev) => {
      const next = !prev;
      AsyncStorage.setItem(VOICE_KEY, String(next)).catch(() => {});
      return next;
    });
  }, []);

  const retryInit = useCallback(() => {
    initialize();
  }, [initialize]);

  const dismissError = useCallback(() => setError(null), []);

  return (
    <CompanionContext.Provider
      value={{
        messages,
        status,
        voiceEnabled,
        initializing,
        initError,
        error,
        isRecording,
        sendText,
        startListening,
        stopListening,
        toggleVoice,
        retryInit,
        dismissError,
      }}
    >
      {children}
    </CompanionContext.Provider>
  );
}

export function useCompanion(): CompanionContextValue {
  const ctx = useContext(CompanionContext);
  if (!ctx) {
    throw new Error("useCompanion must be used within a CompanionProvider");
  }
  return ctx;
}
