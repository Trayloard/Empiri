import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  companionCheckIn,
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

import {
  cadenceHours,
  computeMood,
  DEFAULT_CADENCE,
  freshMoodState,
  registerInteraction,
  shouldCheckIn,
  type CheckInCadence,
  type CompanionMoodState,
  type ComputedMood,
} from "@/lib/mood";
import {
  cancelNudges,
  requestNotificationPermission,
  scheduleNudge,
} from "@/lib/notifications";

export type CompanionStatus =
  | "idle"
  | "thinking"
  | "listening"
  | "transcribing"
  | "speaking";

/**
 * A user turn whose reply failed. We keep the original message id (the
 * optimistic bubble still on screen) and its text so the user can retry
 * with one tap instead of retyping.
 */
export interface FailedTurn {
  messageId: number;
  content: string;
}

interface CompanionContextValue {
  messages: Message[];
  status: CompanionStatus;
  voiceEnabled: boolean;
  notificationsEnabled: boolean;
  checkInCadence: CheckInCadence;
  mood: ComputedMood;
  conversationId: number | null;
  initializing: boolean;
  initError: string | null;
  error: string | null;
  failedTurn: FailedTurn | null;
  isRecording: boolean;
  sendText: (content: string) => Promise<void>;
  retryMessage: () => Promise<void>;
  startListening: () => Promise<void>;
  stopListening: () => Promise<void>;
  toggleVoice: () => void;
  toggleNotifications: () => Promise<void>;
  setCheckInCadence: (cadence: CheckInCadence) => Promise<void>;
  retryInit: () => void;
  dismissError: () => void;
}

const CompanionContext = createContext<CompanionContextValue | undefined>(
  undefined,
);

const CONVERSATION_KEY = "empiri.conversationId";
const VOICE_KEY = "empiri.voiceEnabled";
const MOOD_KEY = "empiri.moodState";
const NOTIF_KEY = "empiri.notificationsEnabled";
const CADENCE_KEY = "empiri.checkInCadence";

const NUDGE_BODY = "I've been thinking about you — come say hi when you can. 🧡";

function tempId(): number {
  return -Math.floor(Math.random() * 1_000_000_000);
}

function parseMoodState(raw: string | null): CompanionMoodState | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<CompanionMoodState>;
    if (
      typeof parsed.baseMood === "number" &&
      typeof parsed.baseEnergy === "number" &&
      typeof parsed.lastInteraction === "number"
    ) {
      return {
        baseMood: parsed.baseMood,
        baseEnergy: parsed.baseEnergy,
        lastInteraction: parsed.lastInteraction,
      };
    }
  } catch {
    // fall through
  }
  return null;
}

export function CompanionProvider({ children }: { children: React.ReactNode }) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [status, setStatus] = useState<CompanionStatus>("idle");
  const [voiceEnabled, setVoiceEnabled] = useState<boolean>(true);
  const [notificationsEnabled, setNotificationsEnabled] =
    useState<boolean>(false);
  const [checkInCadence, setCheckInCadenceState] =
    useState<CheckInCadence>(DEFAULT_CADENCE);
  const [moodState, setMoodState] = useState<CompanionMoodState>(() =>
    freshMoodState(),
  );
  const [mood, setMood] = useState<ComputedMood>(() =>
    computeMood(freshMoodState()),
  );
  const [conversationId, setConversationId] = useState<number | null>(null);
  const [initializing, setInitializing] = useState<boolean>(true);
  const [initError, setInitError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [failedTurn, setFailedTurn] = useState<FailedTurn | null>(null);
  const [isRecording, setIsRecording] = useState<boolean>(false);

  const conversationIdRef = useRef<number | null>(null);
  const failedTurnRef = useRef<FailedTurn | null>(null);
  const moodStateRef = useRef<CompanionMoodState>(moodState);
  const notificationsEnabledRef = useRef<boolean>(notificationsEnabled);
  const checkInCadenceRef = useRef<CheckInCadence>(checkInCadence);
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);

  // Keep refs in sync so timers/callbacks always see the latest values.
  useEffect(() => {
    moodStateRef.current = moodState;
  }, [moodState]);
  useEffect(() => {
    notificationsEnabledRef.current = notificationsEnabled;
  }, [notificationsEnabled]);
  useEffect(() => {
    checkInCadenceRef.current = checkInCadence;
  }, [checkInCadence]);

  const applyMoodState = useCallback((next: CompanionMoodState) => {
    moodStateRef.current = next;
    setMoodState(next);
    setMood(computeMood(next));
    AsyncStorage.setItem(MOOD_KEY, JSON.stringify(next)).catch(() => {});
  }, []);

  // Lift the companion's spirits whenever the user actually engages, and
  // re-arm the "miss you" nudge from this fresh moment of contact.
  const touchInteraction = useCallback(() => {
    const next = registerInteraction(moodStateRef.current);
    applyMoodState(next);
    if (notificationsEnabledRef.current) {
      const hours = cadenceHours(checkInCadenceRef.current);
      if (hours != null) {
        scheduleNudge(NUDGE_BODY, hours).catch(() => {});
      }
    }
  }, [applyMoodState]);

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

  // Stable ref so initialize() can play the check-in greeting without
  // depending on playSpeech's identity.
  const playSpeechRef = useRef(playSpeech);
  useEffect(() => {
    playSpeechRef.current = playSpeech;
  }, [playSpeech]);

  const initialize = useCallback(async () => {
    setInitializing(true);
    setInitError(null);
    try {
      const storedVoice = await AsyncStorage.getItem(VOICE_KEY);
      if (storedVoice !== null) setVoiceEnabled(storedVoice === "true");

      const storedNotif = await AsyncStorage.getItem(NOTIF_KEY);
      const notifOn = storedNotif === "true";
      setNotificationsEnabled(notifOn);
      notificationsEnabledRef.current = notifOn;

      const storedCadence = await AsyncStorage.getItem(CADENCE_KEY);
      const cadence: CheckInCadence =
        storedCadence === "off" ||
        storedCadence === "daily" ||
        storedCadence === "frequent"
          ? storedCadence
          : DEFAULT_CADENCE;
      setCheckInCadenceState(cadence);
      checkInCadenceRef.current = cadence;

      const loadedMood =
        parseMoodState(await AsyncStorage.getItem(MOOD_KEY)) ?? freshMoodState();
      moodStateRef.current = loadedMood;
      setMoodState(loadedMood);
      setMood(computeMood(loadedMood));

      let history: Message[] = [];
      const storedId = await AsyncStorage.getItem(CONVERSATION_KEY);
      if (storedId) {
        const id = Number(storedId);
        conversationIdRef.current = id;
        setConversationId(id);
        history = await listMessages(id);
        setMessages(history);
      } else {
        const conversation = await createConversation({ title: "Empiri" });
        conversationIdRef.current = conversation.id;
        setConversationId(conversation.id);
        await AsyncStorage.setItem(CONVERSATION_KEY, String(conversation.id));
        setMessages([]);
      }

      setInitializing(false);

      // After enough quiet time, let the companion greet the user first. It
      // speaks from its current (faded) mood — the lift only comes once the
      // user replies — so the arc feels real.
      if (
        conversationIdRef.current != null &&
        history.length > 0 &&
        shouldCheckIn(loadedMood, cadence)
      ) {
        try {
          const current = computeMood(loadedMood);
          const greeting = await companionCheckIn(conversationIdRef.current, {
            hoursAway: current.hoursAway,
            mood: current.label,
            missingYou: current.missingYou,
          });
          setMessages((prev) => [...prev, greeting]);
          if (voiceEnabled) {
            setStatus("speaking");
            await playSpeechRef.current(greeting.content);
            setStatus("idle");
          }
        } catch {
          // A failed check-in is silent — the user can still start the chat.
        }
      }
    } catch {
      setInitError("Couldn't reach Empiri. Check your connection and retry.");
      setInitializing(false);
    }
  }, [voiceEnabled]);

  useEffect(() => {
    initialize();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Let the mood drift visibly while the app stays open.
  useEffect(() => {
    const interval = setInterval(() => {
      setMood(computeMood(moodStateRef.current));
    }, 60_000);
    return () => clearInterval(interval);
  }, []);

  const clearFailedTurn = useCallback(() => {
    failedTurnRef.current = null;
    setFailedTurn(null);
  }, []);

  // Shared delivery path for both a fresh send and a retry. The optimistic
  // user bubble (`optimistic`) is already in `messages`; on success we swap it
  // for the server's real pair, and on failure we leave it in place and mark
  // the turn as retryable.
  const deliver = useCallback(
    async (content: string, optimistic: Message, id: number) => {
      setError(null);
      clearFailedTurn();
      setStatus("thinking");

      try {
        const result = await sendMessage(id, { content });

        // The server already returns a 502 for an empty reply, but a 200 could
        // still carry empty/whitespace-only assistant content. Treat that as a
        // failed turn (friendly error, retryable) instead of appending a blank
        // assistant bubble — the exact symptom of the original blank-bubble bug.
        if (!result.assistantMessage?.content?.trim()) {
          throw new Error("empty assistant reply");
        }

        setMessages((prev) => [
          ...prev.filter((m) => m.id !== optimistic.id),
          result.userMessage,
          result.assistantMessage,
        ]);

        // A real exchange happened — the companion perks up.
        touchInteraction();

        if (voiceEnabled) {
          setStatus("speaking");
          await playSpeech(result.assistantMessage.content);
        }
      } catch {
        setError("Empiri couldn't reply just now. Try again.");
        const failed: FailedTurn = { messageId: optimistic.id, content };
        failedTurnRef.current = failed;
        setFailedTurn(failed);
      } finally {
        setStatus("idle");
      }
    },
    [voiceEnabled, playSpeech, touchInteraction, clearFailedTurn],
  );

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
      await deliver(content, optimistic, id);
    },
    [deliver],
  );

  // Re-send the last failed user turn without retyping. The optimistic bubble
  // is still on screen, so we reuse its id and text.
  const retryMessage = useCallback(async () => {
    const turn = failedTurnRef.current;
    const id = conversationIdRef.current;
    if (!turn || id == null) return;

    const optimistic: Message = {
      id: turn.messageId,
      conversationId: id,
      role: "user",
      content: turn.content,
      createdAt: new Date().toISOString(),
    };
    await deliver(turn.content, optimistic, id);
  }, [deliver]);

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

  const toggleNotifications = useCallback(async () => {
    if (notificationsEnabledRef.current) {
      // Bell off: stop OS nudges. The cadence (and in-app greeting) is untouched.
      setNotificationsEnabled(false);
      notificationsEnabledRef.current = false;
      AsyncStorage.setItem(NOTIF_KEY, "false").catch(() => {});
      await cancelNudges();
      return;
    }

    // Bell on: ask permission first and only mutate state once it's granted.
    const granted = await requestNotificationPermission();
    if (!granted) {
      setError(
        "Turn on notifications in your settings to get gentle check-ins from Empiri.",
      );
      return;
    }
    setNotificationsEnabled(true);
    notificationsEnabledRef.current = true;
    AsyncStorage.setItem(NOTIF_KEY, "true").catch(() => {});

    // If outreach had been switched off, turning the bell on restores a
    // sensible cadence so the toggle and the setting never contradict.
    let cadence = checkInCadenceRef.current;
    if (cadence === "off") {
      cadence = DEFAULT_CADENCE;
      checkInCadenceRef.current = cadence;
      setCheckInCadenceState(cadence);
      AsyncStorage.setItem(CADENCE_KEY, cadence).catch(() => {});
    }
    const hours = cadenceHours(cadence);
    if (hours != null) {
      await scheduleNudge(NUDGE_BODY, hours);
    }
  }, []);

  // Let the user tune how often Empiri reaches out. The cadence drives both the
  // in-app greeting threshold (on next open) and the OS nudge interval. "Off"
  // disables proactive outreach and switches the bell off to stay consistent.
  const setCheckInCadence = useCallback(async (next: CheckInCadence) => {
    checkInCadenceRef.current = next;
    setCheckInCadenceState(next);
    AsyncStorage.setItem(CADENCE_KEY, next).catch(() => {});

    if (next === "off") {
      if (notificationsEnabledRef.current) {
        setNotificationsEnabled(false);
        notificationsEnabledRef.current = false;
        AsyncStorage.setItem(NOTIF_KEY, "false").catch(() => {});
      }
      await cancelNudges();
      return;
    }

    // Re-arm the OS nudge at the new interval only when the bell is on. Keep the
    // time already spent away so changing cadence doesn't reset the clock.
    if (notificationsEnabledRef.current) {
      const hours = cadenceHours(next);
      if (hours != null) {
        const hoursAway = computeMood(moodStateRef.current).hoursAway;
        await scheduleNudge(NUDGE_BODY, Math.max(0, hours - hoursAway));
      }
    }
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
        notificationsEnabled,
        checkInCadence,
        mood,
        conversationId,
        initializing,
        initError,
        error,
        failedTurn,
        isRecording,
        sendText,
        retryMessage,
        startListening,
        stopListening,
        toggleVoice,
        toggleNotifications,
        setCheckInCadence,
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
