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
  type Conversation,
  type Message,
  type Percept,
} from "@workspace/api-client-react";
import {
  AudioModule,
  RecordingPresets,
  createAudioPlayer,
  setAudioModeAsync,
  useAudioRecorder,
} from "expo-audio";
import * as Battery from "expo-battery";
import * as FileSystem from "expo-file-system/legacy";
import { Accelerometer } from "expo-sensors";
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { AppState, Platform } from "react-native";

import {
  cadenceHours,
  computeMood,
  DEFAULT_CADENCE,
  freshMoodState,
  registerInteraction,
  type CheckInCadence,
  type CompanionMoodState,
  type ComputedMood,
} from "@/lib/mood";
import { shouldProactivelyCheckIn } from "@/lib/checkInGate";
import {
  cancelNudges,
  requestNotificationPermission,
  scheduleNudge,
  scheduleNudgeInSeconds,
} from "@/lib/notifications";
import { classifyVoiceError } from "@/lib/voiceErrors";
import {
  adjustNudgeHoursForQuietHours,
  DEFAULT_QUIET_HOURS,
  parseQuietHours,
  type QuietHours,
} from "@/lib/quietHours";
import {
  batteryLowPercept,
  chargingPercept,
  collectOutgoingPercepts,
  detectShake,
  pushPercept,
  SENSES_KEY,
  shakeMagnitude,
} from "@/lib/senses";
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
  /** All of the user's conversations (for the chat switcher), oldest first. */
  chats: Conversation[];
  /** Re-fetch the conversation list from the server (best-effort). */
  refreshChats: () => Promise<void>;
  /** Switch to another of the user's conversations and load its history. */
  openConversation: (id: number) => Promise<void>;
  /** Create a fresh conversation and switch to it. */
  startNewChat: () => Promise<void>;
  /** Rename the current conversation; persists on the server and updates
   * the title everywhere immediately. Throws on failure so the caller can
   * surface an error. */
  renameConversation: (title: string) => Promise<void>;
  initializing: boolean;
  initError: string | null;
  error: string | null;
  failedTurn: FailedTurn | null;
  isRecording: boolean;
  /** True while an audio-call mode loop is running. */
  isCallActive: boolean;
  sendText: (content: string) => Promise<void>;
  retryMessage: () => Promise<void>;
  startListening: () => Promise<void>;
  stopListening: () => Promise<boolean>;
  /** Start a continuous listen→transcribe→send→speak call loop. Triggered
   * by a 3-second long-press on the mic button. */
  startCall: () => Promise<void>;
  /** End the active call loop and return to normal text-chat mode. */
  endCall: () => void;
  toggleVoice: () => void;
  toggleNotifications: () => Promise<void>;
  setCheckInCadence: (cadence: CheckInCadence) => Promise<void>;
  /** The user's do-not-disturb window for proactive check-ins. */
  quietHours: QuietHours;
  /** Persist a new quiet-hours window and re-arm any pending nudge around it. */
  setQuietHours: (next: QuietHours) => Promise<void>;
  /** Whether the opt-in device senses (motion, battery, time of day) are on. */
  sensesEnabled: boolean;
  /** Flip the senses opt-in; turning it off discards anything already sensed. */
  toggleSenses: () => void;
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
  const [chats, setChats] = useState<Conversation[]>([]);
  const [initializing, setInitializing] = useState<boolean>(true);
  const [initError, setInitError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [failedTurn, setFailedTurn] = useState<FailedTurn | null>(null);
  const [isRecording, setIsRecording] = useState<boolean>(false);
  const [isCallActive, setIsCallActive] = useState<boolean>(false);
  const [settings, setSettings] = useState<CompanionSettings | null>(null);
  const [sensesEnabled, setSensesEnabled] = useState<boolean>(false);

  const conversationIdRef = useRef<number | null>(null);
  const failedTurnRef = useRef<FailedTurn | null>(null);
  const moodStateRef = useRef<CompanionMoodState>(moodState);
  const notificationsEnabledRef = useRef<boolean>(notificationsEnabled);
  // Mirrors the isRecording state so callbacks that run in async contexts
  // always see the current value without depending on the state directly.
  const isRecordingRef = useRef<boolean>(false);
  const isCallActiveRef = useRef<boolean>(false);
  // When a call is active, Empiri must always speak its reply regardless of
  // the user's voiceEnabled toggle. This ref is read inside deliver().
  const callForcesVoiceRef = useRef<boolean>(false);
  // Used by startCall to auto-stop each recording round after a timeout;
  // cleared by endCall so the loop can exit promptly.
  const callAutoStopRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const callRoundResolveRef = useRef<(() => void) | null>(null);
  const checkInCadenceRef = useRef<CheckInCadence>(checkInCadence);
  const quietHoursRef = useRef<QuietHours>(quietHours);
  const sensesEnabledRef = useRef<boolean>(false);
  const perceptsRef = useRef<Percept[]>([]);
  const lastShakeAtRef = useRef<number | null>(null);
  const batteryLowReportedRef = useRef<boolean>(false);
  // HIGH_QUALITY gives better results with background noise and non-English
  // speech (e.g. German). ~128 kbps AAC; a 20-second clip ≈ 320 KB, well
  // under the 50 MB body limit on the API server.
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

  // Everything sensed since the last request, gated by the opt-in and the
  // platform (see collectOutgoingPercepts). Draining clears the buffer so the
  // same moment is never reported to the companion twice.
  const drainPercepts = useCallback((): Percept[] | undefined => {
    const percepts = collectOutgoingPercepts({
      enabled: sensesEnabledRef.current,
      isWeb: Platform.OS === "web",
      buffer: perceptsRef.current,
    });
    perceptsRef.current = [];
    return percepts.length > 0 ? percepts : undefined;
  }, []);

  // Fetch and present a proactive greeting for the companion's current mood.
  // Shared by the time-based check-in on launch and the dev-only "check in now"
  // shortcut, so both paths stay in lockstep.
  const runCheckIn = useCallback(
    async (state: CompanionMoodState) => {
      const convId = conversationIdRef.current;
      if (convId == null) return;
      try {
        const current = computeMood(state);
        const percepts = drainPercepts();
        const greeting = await companionCheckIn(convId, {
          hoursAway: current.hoursAway,
          mood: current.label,
          missingYou: current.missingYou,
          ...(percepts ? { percepts } : {}),
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
    [voiceEnabled, drainPercepts],
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

      const storedSenses = await AsyncStorage.getItem(SENSES_KEY);
      const sensesOn = storedSenses === "true";
      setSensesEnabled(sensesOn);
      sensesEnabledRef.current = sensesOn;

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
        setChats(owned);
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
          setChats([conversation]);
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
          // Populate the switcher list. Best-effort: the chat itself already
          // loaded, so a failed list fetch must not block the app.
          try {
            setChats(await listConversations());
          } catch {
            // keep whatever we have
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
      // user replies — so the arc feels real. The cadence + quiet-hours
      // suppression rules live in shouldProactivelyCheckIn (lib/checkInGate).
      if (
        conversationIdRef.current != null &&
        history.length > 0 &&
        shouldProactivelyCheckIn(loadedMood, cadence, loadedQuiet)
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

  // Opt-in device senses. Sensor subscriptions exist only while the senses
  // are switched on, the app is foregrounded, and we're on a native platform —
  // the web build has no motion/battery access and degrades to the ambient
  // daypart percept added at send time (see drainPercepts).
  useEffect(() => {
    if (!sensesEnabled || Platform.OS === "web") return;

    let accelSub: { remove: () => void } | null = null;
    let chargeSub: { remove: () => void } | null = null;
    let levelSub: { remove: () => void } | null = null;
    let wasCharging: boolean | null = null;
    let cancelled = false;
    // Bumped by every start()/stop() so a start() that was still awaiting the
    // initial battery read when the app backgrounded can never attach its
    // listeners afterwards (they would be orphaned and leak until unmount).
    let generation = 0;

    const record = (percept: Percept | null) => {
      if (percept) {
        perceptsRef.current = pushPercept(perceptsRef.current, percept);
      }
    };

    const start = async () => {
      const gen = ++generation;
      Accelerometer.setUpdateInterval(200);
      accelSub = Accelerometer.addListener((sample) => {
        const percept = detectShake(
          shakeMagnitude(sample),
          lastShakeAtRef.current,
        );
        if (percept) {
          lastShakeAtRef.current = percept.at;
          record(percept);
        }
      });

      try {
        const state = await Battery.getBatteryStateAsync();
        if (cancelled || gen !== generation) return;
        wasCharging =
          state === Battery.BatteryState.CHARGING ||
          state === Battery.BatteryState.FULL;
        chargeSub = Battery.addBatteryStateListener(({ batteryState }) => {
          const charging =
            batteryState === Battery.BatteryState.CHARGING ||
            batteryState === Battery.BatteryState.FULL;
          record(chargingPercept(wasCharging, charging));
          wasCharging = charging;
        });
        levelSub = Battery.addBatteryLevelListener(({ batteryLevel }) => {
          const percept = batteryLowPercept(
            batteryLevel,
            wasCharging === true,
            batteryLowReportedRef.current,
          );
          if (percept) {
            batteryLowReportedRef.current = true;
            record(percept);
          }
        });
      } catch {
        // Battery info is best-effort; motion sensing still works without it.
      }
    };

    const stop = () => {
      generation++;
      accelSub?.remove();
      accelSub = null;
      chargeSub?.remove();
      chargeSub = null;
      levelSub?.remove();
      levelSub = null;
    };

    if (AppState.currentState === "active") {
      start();
    }
    const appStateSub = AppState.addEventListener("change", (next) => {
      stop();
      if (next === "active") start();
    });

    return () => {
      cancelled = true;
      appStateSub.remove();
      stop();
    };
  }, [sensesEnabled]);

  // End any active voice call when the app moves to the background so the
  // recorder is never left open in an invisible state and temp .m4a files
  // are cleaned up promptly. endCall() handles all cleanup: stops the
  // recorder, resets audio mode, resolves the pending round promise, and
  // clears the auto-stop timeout — so the loop exits on its next iteration.
  useEffect(() => {
    if (Platform.OS === "web") return;
    const sub = AppState.addEventListener("change", (nextState) => {
      if (nextState !== "active" && isCallActiveRef.current) {
        endCall();
      }
    });
    return () => sub.remove();
  }, [endCall]);

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
        const percepts = drainPercepts();

        if (Platform.OS === "web") {
          // ── SSE streaming path ──────────────────────────────────────────────
          const streamResponse = await fetchStream(
            `/conversations/${id}/messages/stream`,
            {
              method: "POST",
              body: JSON.stringify({
                content,
                ...(percepts ? { percepts } : {}),
              }),
            },
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
          const result = await sendMessage(id, {
            content,
            ...(percepts ? { percepts } : {}),
          });
          userMsg = result.userMessage;
          assistantMsg = result.assistantMessage;
        }

        // The server returns 502 for an empty reply, but a 200/stream-done
        // could still carry empty/whitespace-only content. Treat it as a
        // failed turn (retryable) instead of appending a blank bubble.
        if (!assistantMsg?.content?.trim()) {
          throw new Error("empty assistant reply");
        }

        // The user may have switched to another conversation (or started a
        // new chat) while this request was in flight. The reply is already
        // persisted server-side, but it must never be written into the chat
        // that is now on screen — that would mix messages across
        // conversations. The exchange still counts as real contact, though.
        if (conversationIdRef.current !== id) {
          touchInteraction();
          return;
        }

        setMessages((prev) => [
          ...prev.filter((m) => m.id !== optimistic.id),
          userMsg,
          assistantMsg,
        ]);

        // A real exchange happened — the companion perks up.
        touchInteraction();

        if (voiceEnabled || callForcesVoiceRef.current) {
          setStatus("speaking");
          await playSpeech(assistantMsg.content);
        }
      } catch {
        // Same stale-conversation guard: a failure from a chat the user has
        // already left must not surface an error banner, sad mood, or a
        // retryable turn in the newly opened chat (the optimistic bubble it
        // would retry is no longer on screen).
        if (conversationIdRef.current !== id) return;
        setError("Empiri couldn't reply just now. Try again.");
        setMood((prev) => ({ ...prev, label: "sad" }));
        const failed: FailedTurn = { messageId: optimistic.id, content };
        failedTurnRef.current = failed;
        setFailedTurn(failed);
      } finally {
        // openConversation/startNewChat already reset status for their new
        // chat; a stale request must not clobber whatever came after.
        if (conversationIdRef.current === id) {
          setStatus("idle");
        }
      }
    },
    [voiceEnabled, playSpeech, touchInteraction, clearFailedTurn, drainPercepts],
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
      isRecordingRef.current = true;
      setIsRecording(true);
      setStatus("listening");
    } catch {
      setError("Couldn't start recording. Try again.");
      isRecordingRef.current = false;
      setIsRecording(false);
      setStatus("idle");
    }
  }, [recorder]);

  // Returns true when the round completed successfully (text sent), false when
  // it failed (empty audio, transcription/network error). Callers that do not
  // need the result can safely ignore it; startCall uses it to count failures.
  const stopListening = useCallback(async (): Promise<boolean> => {
    if (!isRecordingRef.current) return false;
    isRecordingRef.current = false;
    setIsRecording(false);
    setStatus("transcribing");
    let uri: string | null = null;
    try {
      await recorder.stop();
      // Restore playback-friendly audio mode so TTS replies come through the
      // speaker even on iOS (recording mode routes audio to the earpiece).
      setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true }).catch(() => {});
      uri = recorder.uri ?? null;
      if (!uri) {
        setStatus("idle");
        return false;
      }
      const base64 = await FileSystem.readAsStringAsync(uri, {
        encoding: FileSystem.EncodingType.Base64,
      });
      const { text } = await transcribeAudio({ audio: base64, format: "m4a" });
      if (!text.trim()) {
        setError("I didn't catch that. Try again.");
        setStatus("idle");
        return false;
      }
      await sendText(text);
      return true;
    } catch (err) {
      setError(classifyVoiceError(err));
      setStatus("idle");
      return false;
    } finally {
      // Always remove the temporary recording file to avoid accumulating
      // .m4a files in the app's cache between sessions.
      if (uri) {
        FileSystem.deleteAsync(uri, { idempotent: true }).catch(() => {});
      }
    }
  }, [recorder, sendText]);

  // ── Audio call mode ──────────────────────────────────────────────────────
  // Holding the mic button for 3 s launches a continuous listen → transcribe
  // → send → speak loop. Each round auto-stops after CALL_ROUND_MS; endCall
  // breaks the loop immediately by unblocking the pending await.

  const endCall = useCallback(() => {
    isCallActiveRef.current = false;
    callForcesVoiceRef.current = false;
    setIsCallActive(false);
    if (callAutoStopRef.current != null) {
      clearTimeout(callAutoStopRef.current);
      callAutoStopRef.current = null;
    }
    if (callRoundResolveRef.current != null) {
      callRoundResolveRef.current();
      callRoundResolveRef.current = null;
    }
    if (isRecordingRef.current) {
      isRecordingRef.current = false;
      setIsRecording(false);
      setStatus("idle");
      recorder.stop().catch(() => {}).finally(() => {
        setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true }).catch(() => {});
      });
    } else {
      // Even if not recording, restore playback mode in case it was partially set.
      setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true }).catch(() => {});
    }
  }, [recorder]);

  const startCall = useCallback(async () => {
    if (isCallActiveRef.current) return;
    if (conversationIdRef.current == null) return;

    const CALL_ROUND_MS = 20_000;
    // End the call automatically after this many consecutive failed rounds so
    // a persistent network outage does not loop forever.
    const MAX_CONSECUTIVE_ERRORS = 4;

    isCallActiveRef.current = true;
    callForcesVoiceRef.current = true;
    setIsCallActive(true);

    let consecutiveErrors = 0;

    try {
      while (isCallActiveRef.current) {
        await startListening();

        if (!isRecordingRef.current) {
          // startListening failed (permissions denied, hardware error, etc.)
          break;
        }

        // Wait for the round timeout or an early exit from endCall().
        await new Promise<void>((resolve) => {
          callRoundResolveRef.current = resolve;
          callAutoStopRef.current = setTimeout(() => {
            callRoundResolveRef.current = null;
            resolve();
          }, CALL_ROUND_MS);
        });
        callRoundResolveRef.current = null;
        callAutoStopRef.current = null;

        if (!isCallActiveRef.current) break;

        // Transcribe → send → speak. stopListening returns true on success,
        // false on any error (it also surfaces the error via setError).
        const roundOk = await stopListening();

        if (!roundOk) {
          consecutiveErrors += 1;
          if (consecutiveErrors >= MAX_CONSECUTIVE_ERRORS) break;
        } else {
          consecutiveErrors = 0;
        }

        if (!isCallActiveRef.current) break;
      }
    } finally {
      isCallActiveRef.current = false;
      callForcesVoiceRef.current = false;
      setIsCallActive(false);
    }
  }, [startListening, stopListening]);

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

  // Opt-in senses toggle. OFF is the default and the hard boundary: switching
  // off tears down the sensor subscriptions (via the lifecycle effect) AND
  // discards anything already buffered, so nothing sensed earlier can leak
  // into a later send.
  const toggleSenses = useCallback(() => {
    setSensesEnabled((prev) => {
      const next = !prev;
      sensesEnabledRef.current = next;
      if (!next) {
        perceptsRef.current = [];
        lastShakeAtRef.current = null;
        batteryLowReportedRef.current = false;
      }
      AsyncStorage.setItem(SENSES_KEY, String(next)).catch(() => {});
      return next;
    });
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
    setChats((prev) =>
      prev.map((c) => (c.id === updated.id ? { ...c, title: updated.title } : c)),
    );
  }, []);

  // Re-fetch the switcher list. Best-effort: a failure keeps the old list.
  const refreshChats = useCallback(async () => {
    try {
      setChats(await listConversations());
    } catch {
      // keep whatever we have
    }
  }, []);

  /**
   * Switch the app to another of the user's conversations. Loads the
   * history and title BEFORE swapping the active id so the chat never shows
   * one conversation's messages under another's identity. Throws on failure
   * so the switcher sheet can surface an error and stay open.
   */
  const openConversation = useCallback(async (id: number) => {
    if (conversationIdRef.current === id) return;
    const [conversation, history] = await Promise.all([
      getConversation(id),
      listMessages(id),
    ]);
    conversationIdRef.current = conversation.id;
    setConversationId(conversation.id);
    setConversationTitle(conversation.title);
    setMessages(history);
    failedTurnRef.current = null;
    setFailedTurn(null);
    setError(null);
    setStatus("idle");
    await AsyncStorage.setItem(CONVERSATION_KEY, String(conversation.id));
  }, []);

  /** Create a fresh conversation and switch to it. Throws on failure. */
  const startNewChat = useCallback(async () => {
    const conversation = await createConversation({ title: "New chat" });
    setChats((prev) => [...prev, conversation]);
    conversationIdRef.current = conversation.id;
    setConversationId(conversation.id);
    setConversationTitle(conversation.title);
    setMessages([]);
    failedTurnRef.current = null;
    setFailedTurn(null);
    setError(null);
    setStatus("idle");
    await AsyncStorage.setItem(CONVERSATION_KEY, String(conversation.id));
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
    setChats([]);
    setMessages([]);
    failedTurnRef.current = null;
    setFailedTurn(null);
    setError(null);
    setStatus("idle");
    setNotificationsEnabled(false);
    notificationsEnabledRef.current = false;
    perceptsRef.current = [];
    lastShakeAtRef.current = null;
    batteryLowReportedRef.current = false;

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
        chats,
        refreshChats,
        openConversation,
        startNewChat,
        renameConversation,
        initializing,
        initError,
        error,
        failedTurn,
        isRecording,
        isCallActive,
        sendText,
        retryMessage,
        startListening,
        stopListening,
        startCall,
        endCall,
        toggleVoice,
        toggleNotifications,
        setCheckInCadence,
        quietHours,
        setQuietHours,
        sensesEnabled,
        toggleSenses,
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
