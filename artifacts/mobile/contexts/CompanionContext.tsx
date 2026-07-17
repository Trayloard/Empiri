import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  companionCheckIn,
  createConversation,
  devRegressSelf,
  fetchStream,
  getCompanionSettings,
  getConversation,
  listConversations,
  listMessages,
  renameConversation as apiRenameConversation,
  sendMessage,
  synthesizeSpeech,
  transcribeAudio,
  updateCompanionSettings,
  type CompanionSettings,
  type CompanionSettingsInput,
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
  scheduleNudgeInSeconds,
} from "@/lib/notifications";
import {
  adjustNudgeHoursForQuietHours,
  DEFAULT_QUIET_HOURS,
  isInQuietHours,
  parseQuietHours,
  type QuietHours,
} from "@/lib/quietHours";
import { useAuth } from "@/lib/auth";

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
  /** The user-visible title of the current conversation. */
  conversationTitle: string;
  /** Rename the current conversation; persists on the server and updates
   * the title everywhere immediately. Throws on failure so the caller can
   * surface an error. */
  renameConversation: (title: string) => Promise<void>;
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
  /** The user's do-not-disturb window for proactive check-ins. */
  quietHours: QuietHours;
  /** Persist a new quiet-hours window and re-arm any pending nudge around it. */
  setQuietHours: (next: QuietHours) => Promise<void>;
  retryInit: () => void;
  dismissError: () => void;
  signOut: () => Promise<void>;
  /** DEV-only: fire the proactive check-in greeting immediately, ignoring the
   * time-away threshold. No-op in production builds. */
  devTriggerCheckIn: () => Promise<void>;
  /** DEV-only: schedule a notification nudge a few seconds out instead of hours.
   * No-op in production builds. */
  devScheduleNudgeSoon: () => Promise<void>;
  /** DEV-only: roll Empiri's inner self back a few steps (halve interactions,
   * trim interests/narrative, nudge traits and drives toward baseline) so the
   * early-relationship UX can be retested without creating a fresh conversation.
   * No-op in production builds. */
  devRegressSelf: () => Promise<void>;
  /** The user's saved personalisation settings (name, tone, personality note). */
  settings: CompanionSettings | null;
  /** Persist a partial update to the companion settings. */
  saveSettings: (patch: CompanionSettingsInput) => Promise<void>;
}

const CompanionContext = createContext<CompanionContextValue | undefined>(
  undefined,
);

const CONVERSATION_KEY = "empiri.conversationId";
const VOICE_KEY = "empiri.voiceEnabled";
const MOOD_KEY = "empiri.moodState";
const NOTIF_KEY = "empiri.notificationsEnabled";
const CADENCE_KEY = "empiri.checkInCadence";
const QUIET_HOURS_KEY = "empiri.quietHours";

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
  const { isAuthenticated, isLoading: authLoading, logout } = useAuth();
  const [messages, setMessages] = useState<Message[]>([]);
  const [status, setStatus] = useState<CompanionStatus>("idle");
  const [voiceEnabled, setVoiceEnabled] = useState<boolean>(true);
  const [notificationsEnabled, setNotificationsEnabled] =
    useState<boolean>(false);
  const [checkInCadence, setCheckInCadenceState] =
    useState<CheckInCadence>(DEFAULT_CADENCE);
  const [quietHours, setQuietHoursState] =
    useState<QuietHours>(DEFAULT_QUIET_HOURS);
  const [moodState, setMoodState] = useState<CompanionMoodState>(() =>
    freshMoodState(),
  );
  const [mood, setMood] = useState<ComputedMood>(() =>
    computeMood(freshMoodState()),
  );
  const [conversationId, setConversationId] = useState<number | null>(null);
  const [conversationTitle, setConversationTitle] = useState<string>("Empiri");
  const [initializing, setInitializing] = useState<boolean>(true);
  const [initError, setInitError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [failedTurn, setFailedTurn] = useState<FailedTurn | null>(null);
  const [isRecording, setIsRecording] = useState<boolean>(false);
  const [settings, setSettings] = useState<CompanionSettings | null>(null);

  const conversationIdRef = useRef<number | null>(null);
  const failedTurnRef = useRef<FailedTurn | null>(null);
  const moodStateRef = useRef<CompanionMoodState>(moodState);
  const notificationsEnabledRef = useRef<boolean>(notificationsEnabled);
  const checkInCadenceRef = useRef<CheckInCadence>(checkInCadence);
  const quietHoursRef = useRef<QuietHours>(quietHours);
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
  useEffect(() => {
    quietHoursRef.current = quietHours;
  }, [quietHours]);

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
        const adjusted = adjustNudgeHoursForQuietHours(
          quietHoursRef.current,
          hours,
        );
        scheduleNudge(NUDGE_BODY, adjusted).catch(() => {});
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

  // Fetch and present a proactive greeting for the companion's current mood.
  // Shared by the time-based check-in on launch and the dev-only "check in now"
  // shortcut, so both paths stay in lockstep.
  const runCheckIn = useCallback(
    async (state: CompanionMoodState) => {
      const convId = conversationIdRef.current;
      if (convId == null) return;
      try {
        const current = computeMood(state);
        const greeting = await companionCheckIn(convId, {
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
    },
    [voiceEnabled],
  );

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

      const loadedQuiet =
        parseQuietHours(await AsyncStorage.getItem(QUIET_HOURS_KEY)) ??
        DEFAULT_QUIET_HOURS;
      setQuietHoursState(loadedQuiet);
      quietHoursRef.current = loadedQuiet;

      const loadedMood =
        parseMoodState(await AsyncStorage.getItem(MOOD_KEY)) ?? freshMoodState();
      moodStateRef.current = loadedMood;
      setMoodState(loadedMood);
      setMood(computeMood(loadedMood));

      // Load personalisation settings (creates defaults on first call).
      try {
        const loadedSettings = await getCompanionSettings();
        setSettings(loadedSettings);
      } catch {
        // Settings are cosmetic — a failure here must not block the app.
      }

      let history: Message[] = [];

      // Helper: resume or create from the server (used both on fresh install
      // and as a fallback when the locally stored ID turns out to be stale).
      const resumeOrCreate = async () => {
        const owned = await listConversations();
        if (owned.length > 0) {
          const conversation = owned[0];
          conversationIdRef.current = conversation.id;
          setConversationId(conversation.id);
          setConversationTitle(conversation.title);
          await AsyncStorage.setItem(CONVERSATION_KEY, String(conversation.id));
          history = await listMessages(conversation.id);
          setMessages(history);
        } else {
          const conversation = await createConversation({ title: "Empiri" });
          conversationIdRef.current = conversation.id;
          setConversationId(conversation.id);
          setConversationTitle(conversation.title);
          await AsyncStorage.setItem(CONVERSATION_KEY, String(conversation.id));
          setMessages([]);
        }
      };

      const storedId = await AsyncStorage.getItem(CONVERSATION_KEY);
      if (storedId) {
        const id = Number(storedId);
        let stale = false;
        try {
          conversationIdRef.current = id;
          setConversationId(id);
          history = await listMessages(id);
          setMessages(history);
          // Load the persisted title so a rename survives app restarts.
          // Best-effort: a failure here must not block the chat.
          try {
            const conversation = await getConversation(id);
            setConversationTitle(conversation.title);
          } catch {
            // keep the default title
          }
        } catch (err) {
          // If the stored conversation no longer exists on the server (e.g.
          // the account changed or it was deleted), fall back gracefully.
          if (
            typeof err === "object" &&
            err !== null &&
            "status" in err &&
            (err as { status: number }).status === 404
          ) {
            stale = true;
            await AsyncStorage.removeItem(CONVERSATION_KEY);
            conversationIdRef.current = null;
            setConversationId(null);
          } else {
            throw err;
          }
        }
        if (stale) {
          // Resume or create a fresh conversation via the server.
          await resumeOrCreate();
        }
      } else {
        // No locally stored conversation (fresh install or new device).
        // Resume the account's existing conversation if one exists so chat
        // history follows the user across devices; only create a new one
        // when the account has none yet.
        await resumeOrCreate();
      }

      setInitializing(false);

      // After enough quiet time, let the companion greet the user first. It
      // speaks from its current (faded) mood — the lift only comes once the
      // user replies — so the arc feels real.
      if (
        conversationIdRef.current != null &&
        history.length > 0 &&
        shouldCheckIn(loadedMood, cadence) &&
        !isInQuietHours(loadedQuiet)
      ) {
        await runCheckIn(loadedMood);
      }
    } catch {
      setInitError("Couldn't reach Empiri. Check your connection and retry.");
      setInitializing(false);
    }
  }, [runCheckIn]);

  useEffect(() => {
    // Wait for auth to finish loading. Only initialize when signed in.
    if (authLoading) return;
    if (!isAuthenticated) {
      setInitializing(false);
      return;
    }
    initialize();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated, authLoading]);

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
  //
  // On web we use the SSE streaming endpoint with a line-buffer accumulator so
  // partial SSE chunks (split across network packets) are never silently
  // dropped. On React Native the ReadableStream API is not exposed, so we fall
  // back to the regular REST endpoint. Either path routes errors through the
  // same catch block which sets mood → "sad" and marks the turn as retryable.
  const deliver = useCallback(
    async (content: string, optimistic: Message, id: number) => {
      setError(null);
      clearFailedTurn();
      setStatus("thinking");

      try {
        let userMsg: Message;
        let assistantMsg: Message;

        if (Platform.OS === "web") {
          // ── SSE streaming path ──────────────────────────────────────────────
          const streamResponse = await fetchStream(
            `/conversations/${id}/messages/stream`,
            { method: "POST", body: JSON.stringify({ content }) },
          );

          if (!streamResponse.ok) {
            throw new Error(`HTTP ${streamResponse.status}`);
          }

          const reader = streamResponse.body?.getReader();
          if (!reader) {
            throw new Error("ReadableStream not available");
          }

          const decoder = new TextDecoder();
          let buffer = "";
          let serverError = false;
          let completed = false;
          let streamResult: {
            userMessage: Message;
            assistantMessage: Message;
          } | null = null;

          // Accumulate chunks into a line buffer so SSE events split across
          // network packets are reassembled before parsing.
          loop: while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split("\n");
            buffer = lines.pop() ?? ""; // keep the last incomplete line

            for (const line of lines) {
              if (!line.startsWith("data: ")) continue;
              try {
                const payload = JSON.parse(line.slice(6)) as {
                  delta?: string;
                  error?: string;
                  done?: boolean;
                  userMessage?: Message;
                  assistantMessage?: Message;
                };
                if (payload.error) {
                  serverError = true;
                  break loop;
                }
                if (payload.done && payload.userMessage && payload.assistantMessage) {
                  completed = true;
                  streamResult = {
                    userMessage: payload.userMessage,
                    assistantMessage: payload.assistantMessage,
                  };
                  break loop;
                }
              } catch {
                // Malformed SSE line — skip and continue
              }
            }
          }

          if (serverError || !completed || !streamResult) {
            throw new Error("AI stream did not complete");
          }

          userMsg = streamResult.userMessage;
          assistantMsg = streamResult.assistantMessage;
        } else {
          // ── React Native fallback ───────────────────────────────────────────
          // ReadableStream is not exposed in RN; use the regular REST endpoint.
          const result = await sendMessage(id, { content });
          userMsg = result.userMessage;
          assistantMsg = result.assistantMessage;
        }

        // The server returns 502 for an empty reply, but a 200/stream-done
        // could still carry empty/whitespace-only content. Treat it as a
        // failed turn (retryable) instead of appending a blank bubble.
        if (!assistantMsg?.content?.trim()) {
          throw new Error("empty assistant reply");
        }

        setMessages((prev) => [
          ...prev.filter((m) => m.id !== optimistic.id),
          userMsg,
          assistantMsg,
        ]);

        // A real exchange happened — the companion perks up.
        touchInteraction();

        if (voiceEnabled) {
          setStatus("speaking");
          await playSpeech(assistantMsg.content);
        }
      } catch {
        setError("Empiri couldn't reply just now. Try again.");
        setMood((prev) => ({ ...prev, label: "sad" }));
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
      await scheduleNudge(
        NUDGE_BODY,
        adjustNudgeHoursForQuietHours(quietHoursRef.current, hours),
      );
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
        await scheduleNudge(
          NUDGE_BODY,
          adjustNudgeHoursForQuietHours(
            quietHoursRef.current,
            Math.max(0, hours - hoursAway),
          ),
        );
      }
    }
  }, []);

  // Persist the do-not-disturb window and re-arm any pending nudge so a
  // change takes effect immediately instead of on the next interaction.
  const setQuietHours = useCallback(async (next: QuietHours) => {
    quietHoursRef.current = next;
    setQuietHoursState(next);
    AsyncStorage.setItem(QUIET_HOURS_KEY, JSON.stringify(next)).catch(() => {});

    if (notificationsEnabledRef.current) {
      const hours = cadenceHours(checkInCadenceRef.current);
      if (hours != null) {
        const hoursAway = computeMood(moodStateRef.current).hoursAway;
        await scheduleNudge(
          NUDGE_BODY,
          adjustNudgeHoursForQuietHours(next, Math.max(0, hours - hoursAway)),
        );
      }
    }
  }, []);

  // DEV-ONLY QA shortcuts. On-device verification of the proactive flows is slow
  // because both depend on real elapsed time (hours of backgrounding). These
  // fire the greeting immediately and queue a nudge seconds out. Everything is
  // gated on `__DEV__`, so the bodies are dead-code-eliminated from production
  // builds and never wired into the production UI.
  const devTriggerCheckIn = useCallback(async () => {
    if (!__DEV__) return;
    await runCheckIn(moodStateRef.current);
  }, [runCheckIn]);

  const devScheduleNudgeSoon = useCallback(async () => {
    if (!__DEV__) return;
    const granted = await requestNotificationPermission();
    if (!granted) return;
    await scheduleNudgeInSeconds(NUDGE_BODY);
  }, []);

  const devRegressSelfFn = useCallback(async () => {
    if (!__DEV__) return;
    const convId = conversationIdRef.current;
    if (convId == null) return;
    try {
      await devRegressSelf(convId);
    } catch {
      // Best-effort: dev-only, failure is silent.
    }
  }, []);

  const renameConversation = useCallback(async (raw: string) => {
    const title = raw.trim();
    const id = conversationIdRef.current;
    if (!title || id == null) return;
    const updated = await apiRenameConversation(id, { title });
    setConversationTitle(updated.title);
  }, []);

  const saveSettings = useCallback(async (patch: CompanionSettingsInput) => {
    const updated = await updateCompanionSettings(patch);
    setSettings(updated);
  }, []);

  const retryInit = useCallback(() => {
    initialize();
  }, [initialize]);

  const dismissError = useCallback(() => setError(null), []);

  // Tear down this device's per-relationship state on sign-out so a different
  // account never inherits the previous user's conversation, mood, or pending
  // nudges, then end the auth session.
  const signOut = useCallback(async () => {
    try {
      await AsyncStorage.multiRemove([CONVERSATION_KEY, MOOD_KEY, NOTIF_KEY]);
    } catch {
      // Best-effort cleanup; signing out must still proceed.
    }
    await cancelNudges().catch(() => {});

    conversationIdRef.current = null;
    setConversationId(null);
    setConversationTitle("Empiri");
    setMessages([]);
    failedTurnRef.current = null;
    setFailedTurn(null);
    setError(null);
    setStatus("idle");
    setNotificationsEnabled(false);
    notificationsEnabledRef.current = false;

    const fresh = freshMoodState();
    moodStateRef.current = fresh;
    setMoodState(fresh);
    setMood(computeMood(fresh));
    setSettings(null);

    await logout();
  }, [logout]);

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
        conversationTitle,
        renameConversation,
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
        quietHours,
        setQuietHours,
        retryInit,
        dismissError,
        signOut,
        devTriggerCheckIn,
        devScheduleNudgeSoon,
        devRegressSelf: devRegressSelfFn,
        settings,
        saveSettings,
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
