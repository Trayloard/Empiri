import { Feather } from "@expo/vector-icons";
import type { Message } from "@workspace/api-client-react";
import { BlurView } from "expo-blur";
import { useRouter } from "expo-router";
import * as Haptics from "expo-haptics";
import { StatusBar } from "expo-status-bar";
import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  useColorScheme,
  useWindowDimensions,
} from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import { KeyboardAvoidingView } from "react-native-keyboard-controller";
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { AmbientGlow } from "@/components/AmbientGlow";
import { ChatInput } from "@/components/ChatInput";
import { CheckInSettingsSheet } from "@/components/CheckInSettingsSheet";
import { CompanionOrb } from "@/components/CompanionOrb";
import { InnerSelfSheet } from "@/components/InnerSelfSheet";
import { MessageBubble, RetryBubble, TypingBubble } from "@/components/MessageBubble";
import { FONTS } from "@/constants/fonts";
import { useCompanion } from "@/contexts/CompanionContext";
import { useSmoothedWarmth } from "@/hooks/useAccentColor";
import { useColors } from "@/hooks/useColors";
import { useCompanionTraits } from "@/hooks/useCompanionTraits";
import { accentForWarmth } from "@/lib/accent";
import { useAuth } from "@/lib/auth";
import type { MoodLabel } from "@/lib/mood";

const ORB_SIZE = 76;
const ORB_R = ORB_SIZE / 2;

function moodLabel(mood: MoodLabel): string {
  switch (mood) {
    case "bright":   return "Feeling bright ✨";
    case "happy":    return "Happy you're here";
    case "content":  return "Here for you";
    case "low":      return "Missing you a little";
    case "sleepy":   return "A bit sleepy…";
    case "sad":      return "Having a rough moment…";
  }
}

function statusLabel(
  status: ReturnType<typeof useCompanion>["status"],
  mood: MoodLabel,
): string {
  switch (status) {
    case "listening":   return "Listening…";
    case "transcribing": return "Got it…";
    case "thinking":    return "Thinking…";
    case "speaking":    return "Speaking…";
    default:            return moodLabel(mood);
  }
}

interface NavButtonProps {
  icon: keyof typeof Feather.glyphMap;
  label: string;
  active?: boolean;
  activeColor: string;
  onPress: () => void;
}

function NavButton({ icon, label, active, activeColor, onPress }: NavButtonProps) {
  const colors = useColors();
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.navBtn, { opacity: pressed ? 0.65 : active ? 1 : 0.52 }]}
    >
      <View
        style={[
          styles.navBtnIcon,
          {
            backgroundColor: active ? `${activeColor}22` : colors.glass,
            borderColor: active ? `${activeColor}55` : colors.glassBorder,
          },
        ]}
      >
        <BlurView
          intensity={18}
          tint={colors.blurTint}
          style={StyleSheet.absoluteFill}
        />
        <Feather
          name={icon}
          size={19}
          color={active ? activeColor : colors.mutedForeground}
        />
      </View>
      <Text style={[styles.navBtnLabel, { color: active ? activeColor : colors.mutedForeground }]}>
        {label}
      </Text>
    </Pressable>
  );
}

export default function CompanionScreen() {
  const colors = useColors();
  const scheme = useColorScheme();
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();

  const {
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
    settings,
    sendText,
    retryMessage,
    startListening,
    stopListening,
    toggleVoice,
    toggleNotifications,
    setCheckInCadence,
    quietHours,
    setQuietHours,
    sensesEnabled,
    toggleSenses,
    retryInit,
    dismissError,
    devTriggerCheckIn,
    devScheduleNudgeSoon,
    devRegressSelf,
    signOut,
  } = useCompanion();

  const { isAuthenticated, isLoading: authLoading, login } = useAuth();

  const traits = useCompanionTraits(conversationId);
  // One shared warmth tween feeds every personality-tinted surface, so the
  // chrome accent, primary buttons, and send/mic gradient all drift together.
  const smoothWarmth = useSmoothedWarmth(traits.warmthShift);
  const accent = accentForWarmth(smoothWarmth, colors.statusAccent, colors.spectrum);
  // Primary CTAs blend from the brand button color (not statusAccent), so a
  // neutral personality keeps today's exact button color and CTAs stay bold.
  const primaryAccent = accentForWarmth(smoothWarmth, colors.primary, colors.spectrum);
  const [peekVisible, setPeekVisible] = useState(false);
  const [settingsVisible, setSettingsVisible] = useState(false);

  // Rename-chat modal state
  const [renameVisible, setRenameVisible] = useState(false);
  const [renameDraft, setRenameDraft] = useState("");
  const [renameSaving, setRenameSaving] = useState(false);
  const [renameError, setRenameError] = useState<string | null>(null);

  const openRename = () => {
    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setRenameDraft(conversationTitle);
    setRenameError(null);
    setRenameVisible(true);
  };

  const submitRename = async () => {
    const next = renameDraft.trim();
    if (!next) {
      setRenameError("Please enter a name.");
      return;
    }
    if (next === conversationTitle) {
      setRenameVisible(false);
      return;
    }
    setRenameSaving(true);
    setRenameError(null);
    try {
      await renameConversation(next);
      setRenameVisible(false);
    } catch {
      setRenameError("Couldn't rename the chat. Try again.");
    } finally {
      setRenameSaving(false);
    }
  };

  const topPad   = Platform.OS === "web" ? 24 : insets.top + 8;
  const bottomPad = Platform.OS === "web" ? 20 : insets.bottom + 6;

  // Floating orb position — default bottom-right, above the nav row.
  const orbX = useSharedValue(width - ORB_R - 22);
  const orbY = useSharedValue(height * 0.55);

  // Update default x when width changes (orientation).
  useEffect(() => {
    orbX.value = width - ORB_R - 22;
  }, [width, orbX]);

  // Drag gesture — runs on the UI thread.
  const [isDragging, setIsDragging] = useState(false);
  const pan = Gesture.Pan()
    .onBegin(() => {
      "worklet";
    })
    .onChange((e) => {
      "worklet";
      orbX.value = Math.max(ORB_R + 4, Math.min(width - ORB_R - 4, orbX.value + e.changeX));
      orbY.value = Math.max(topPad + ORB_R + 4, Math.min(height - 200, orbY.value + e.changeY));
    });

  // Bloom-in on mount — orb scales up from nothing.
  const reduceMotion = useReducedMotion();
  const bloom = useSharedValue(reduceMotion ? 1 : 0);
  useEffect(() => {
    if (reduceMotion) { bloom.value = 1; return; }
    bloom.value = withTiming(1, { duration: 1100, easing: Easing.out(Easing.cubic) });
  }, [bloom, reduceMotion]);

  const orbAnimStyle = useAnimatedStyle(() => ({
    position: "absolute",
    left: orbX.value - ORB_R,
    top:  orbY.value - ORB_R,
    opacity: bloom.value,
    transform: [{ scale: 0.6 + bloom.value * 0.4 }],
  }));

  const reversed = useMemo(() => [...messages].reverse(), [messages]);
  const busy = status === "thinking" || status === "transcribing" || status === "speaking";

  const handleMic = () => {
    if (isRecording) stopListening(); else startListening();
  };
  const handleRetry = () => {
    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    retryMessage();
  };
  const handleToggleVoice = () => {
    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    toggleVoice();
  };
  const handleToggleNotifications = () => {
    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    toggleNotifications();
  };
  const handleOpenPeek = () => {
    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setPeekVisible(true);
  };
  const router = useRouter();

  const handleOpenSettings = () => {
    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSettingsVisible(true);
  };

  const handlePersonalize = () => {
    setSettingsVisible(false);
    router.push("/companion-settings");
  };

  const handleSignOut = () => {
    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSettingsVisible(false);
    signOut();
  };

  const handleDevCheckIn = () => {
    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSettingsVisible(false);
    devTriggerCheckIn();
  };
  const handleDevNudge = () => {
    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    devScheduleNudgeSoon();
  };
  const handleDevRegress = () => {
    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    devRegressSelf();
  };

  if (authLoading) {
    return (
      <View style={[styles.root, styles.center, { backgroundColor: colors.background }]}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  if (!isAuthenticated) {
    return (
      <View style={[styles.root, styles.center, { backgroundColor: colors.background }]}>
        <StatusBar style={scheme === "dark" ? "light" : "dark"} />
        <Text style={[styles.emptyTitle, { color: colors.foreground, marginBottom: 8 }]}>
          Welcome to Empiri
        </Text>
        <Text style={[styles.emptyText, { color: colors.mutedForeground, marginBottom: 32 }]}>
          Sign in to start your conversation.
        </Text>
        <Pressable onPress={login} style={[styles.retry, { backgroundColor: primaryAccent }]}>
          <Text style={[styles.retryText, { color: colors.primaryForeground }]}>Sign in</Text>
        </Pressable>
      </View>
    );
  }

  const orbStatusText = statusLabel(status, mood.label);

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <StatusBar style={scheme === "dark" ? "light" : "dark"} />
      <AmbientGlow status={status} traits={traits} />

      <KeyboardAvoidingView style={styles.flex} behavior="padding" keyboardVerticalOffset={0}>
        {/* Chat — full height, top padding leaves room for status bar */}
        <View style={[styles.flex, { paddingTop: topPad + 4 }]}>
          {/* Chat title header — tap the pencil (or the title) to rename */}
          {!initializing && !initError && conversationId != null ? (
            <Pressable
              onPress={openRename}
              accessibilityRole="button"
              accessibilityLabel="Rename this chat"
              testID="chat-title"
              style={({ pressed }) => [
                styles.titleRow,
                { opacity: pressed ? 0.6 : 1 },
              ]}
            >
              <Text
                style={[styles.titleText, { color: colors.foreground }]}
                numberOfLines={1}
              >
                {conversationTitle}
              </Text>
              <Feather name="edit-2" size={13} color={colors.mutedForeground} />
            </Pressable>
          ) : null}
          {initializing ? (
            <View style={styles.center}>
              <ActivityIndicator color={colors.primary} />
            </View>
          ) : initError ? (
            <View style={styles.center}>
              <Feather name="cloud-off" size={36} color={colors.mutedForeground} />
              <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>{initError}</Text>
              <Pressable onPress={retryInit} style={[styles.retry, { backgroundColor: primaryAccent }]}>
                <Text style={[styles.retryText, { color: colors.primaryForeground }]}>Retry</Text>
              </Pressable>
            </View>
          ) : messages.length === 0 ? (
            <View style={styles.center}>
              <Text style={[styles.emptyTitle, { color: colors.foreground }]}>Say hi to Empiri</Text>
              <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>
                Type a message or tap the mic to talk. I'm always here for a chat.
              </Text>
            </View>
          ) : (
            <FlatList
              data={reversed}
              inverted
              keyExtractor={(item: Message) => String(item.id)}
              renderItem={({ item }) => (
                <MessageBubble role={item.role} content={item.content} />
              )}
              ListHeaderComponent={
                status === "thinking" || status === "transcribing" ? (
                  <TypingBubble />
                ) : failedTurn ? (
                  <RetryBubble onRetry={handleRetry} accent={accent} />
                ) : null
              }
              contentContainerStyle={styles.listContent}
              keyboardDismissMode="interactive"
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            />
          )}
        </View>

        {/* Transient error banner */}
        {error ? (
          <Pressable
            onPress={dismissError}
            style={[styles.errorBanner, { backgroundColor: colors.destructive }]}
          >
            <Feather name="alert-circle" size={15} color="#fff" />
            <Text style={styles.errorText}>{error}</Text>
            <Feather name="x" size={15} color="#fff" />
          </Pressable>
        ) : null}

        {/* Input + bottom nav */}
        <View style={{ paddingBottom: bottomPad }}>
          <ChatInput
            onSend={sendText}
            onMicPress={handleMic}
            isRecording={isRecording}
            busy={busy}
            warmth={smoothWarmth}
          />
          {/* Nav row — replaces scattered corner buttons */}
          <View style={styles.navRow}>
            <NavButton
              icon={notificationsEnabled ? "bell" : "bell-off"}
              label="Benachrichtigung"
              active={notificationsEnabled}
              activeColor={accent}
              onPress={handleToggleNotifications}
            />
            <NavButton
              icon={voiceEnabled ? "volume-2" : "volume-x"}
              label="Stimme"
              active={voiceEnabled}
              activeColor={accent}
              onPress={handleToggleVoice}
            />
            <NavButton
              icon="settings"
              label="Einstellungen"
              active={false}
              activeColor={accent}
              onPress={handleOpenSettings}
            />
          </View>
        </View>
      </KeyboardAvoidingView>

      {/* Floating draggable orb — outside KAV so keyboard doesn't shift it */}
      <GestureDetector gesture={pan}>
        <Animated.View style={orbAnimStyle} pointerEvents="box-none">
          {/* Tooltip pill — name + mood status */}
          <View
            style={[
              styles.tooltip,
              {
                borderColor: `${accent}44`,
                right: ORB_SIZE + 10,
              },
            ]}
            pointerEvents="none"
          >
            <BlurView intensity={28} tint={colors.blurTint} style={StyleSheet.absoluteFill} />
            <Text style={[styles.tooltipName, { color: accent }]}>{settings?.companionName ?? "Empiri"}</Text>
            <Text style={[styles.tooltipStatus, { color: colors.mutedForeground }]} numberOfLines={1}>
              {orbStatusText}
            </Text>
          </View>

          {/* Orb itself */}
          <Pressable
            onPress={handleOpenPeek}
            testID="inner-self-button"
            accessibilityRole="button"
            accessibilityLabel="Peek inside Empiri"
            hitSlop={10}
          >
            <CompanionOrb
              status={status}
              mood={mood.label}
              size={ORB_SIZE}
              traits={traits}
            />
          </Pressable>
        </Animated.View>
      </GestureDetector>

      <InnerSelfSheet
        visible={peekVisible}
        conversationId={conversationId}
        onClose={() => setPeekVisible(false)}
        warmth={smoothWarmth}
      />

      {/* Rename-chat modal */}
      <Modal
        visible={renameVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setRenameVisible(false)}
      >
        <Pressable
          style={styles.renameBackdrop}
          onPress={() => !renameSaving && setRenameVisible(false)}
        >
          <Pressable
            style={[
              styles.renameCard,
              { backgroundColor: colors.background, borderColor: colors.glassBorder },
            ]}
            onPress={() => {}}
          >
            <Text style={[styles.renameTitle, { color: colors.foreground }]}>
              Rename chat
            </Text>
            <TextInput
              value={renameDraft}
              onChangeText={setRenameDraft}
              placeholder="Chat name"
              placeholderTextColor={colors.mutedForeground}
              maxLength={80}
              autoFocus
              editable={!renameSaving}
              onSubmitEditing={submitRename}
              returnKeyType="done"
              testID="rename-input"
              style={[
                styles.renameInput,
                {
                  color: colors.foreground,
                  borderColor: renameError ? colors.destructive : colors.glassBorder,
                  backgroundColor: colors.glass,
                },
              ]}
            />
            {renameError ? (
              <Text style={[styles.renameError, { color: colors.destructive }]}>
                {renameError}
              </Text>
            ) : null}
            <View style={styles.renameActions}>
              <Pressable
                onPress={() => setRenameVisible(false)}
                disabled={renameSaving}
                style={({ pressed }) => [
                  styles.renameBtn,
                  { opacity: pressed || renameSaving ? 0.6 : 1 },
                ]}
              >
                <Text style={[styles.renameBtnText, { color: colors.mutedForeground }]}>
                  Cancel
                </Text>
              </Pressable>
              <Pressable
                onPress={submitRename}
                disabled={renameSaving}
                testID="rename-save"
                style={({ pressed }) => [
                  styles.renameBtn,
                  styles.renameBtnPrimary,
                  {
                    backgroundColor: primaryAccent,
                    opacity: pressed || renameSaving ? 0.7 : 1,
                  },
                ]}
              >
                {renameSaving ? (
                  <ActivityIndicator size="small" color={colors.primaryForeground} />
                ) : (
                  <Text style={[styles.renameBtnText, { color: colors.primaryForeground }]}>
                    Save
                  </Text>
                )}
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      <CheckInSettingsSheet
        visible={settingsVisible}
        cadence={checkInCadence}
        onSelect={setCheckInCadence}
        quietHours={quietHours}
        onQuietHoursChange={setQuietHours}
        sensesEnabled={sensesEnabled}
        onSensesToggle={toggleSenses}
        onClose={() => setSettingsVisible(false)}
        accent={accent}
        onPersonalize={handlePersonalize}
        onSignOut={handleSignOut}
        onDevCheckIn={__DEV__ ? handleDevCheckIn : undefined}
        onDevNudge={__DEV__ ? handleDevNudge : undefined}
        onDevRegress={__DEV__ ? handleDevRegress : undefined}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  flex: { flex: 1 },
  center: {
    flex: 1, alignItems: "center", justifyContent: "center",
    paddingHorizontal: 40, gap: 12,
  },
  emptyTitle: {
    fontSize: 21, fontFamily: FONTS.bold, letterSpacing: -0.3,
  },
  emptyText: {
    fontSize: 15, lineHeight: 21, textAlign: "center", fontFamily: FONTS.regular,
  },
  retry: {
    marginTop: 6, paddingHorizontal: 24, paddingVertical: 11, borderRadius: 22,
  },
  retryText: {
    fontSize: 15, fontFamily: FONTS.semibold,
  },
  listContent: { paddingVertical: 12 },
  // Chat title header
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingHorizontal: 48,
    paddingBottom: 2,
  },
  titleText: {
    fontSize: 15,
    fontFamily: FONTS.semibold,
    letterSpacing: -0.2,
    maxWidth: "80%",
  },
  // Rename modal
  renameBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.45)",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 28,
  },
  renameCard: {
    width: "100%",
    maxWidth: 400,
    borderRadius: 20,
    borderWidth: 1,
    padding: 20,
    gap: 12,
  },
  renameTitle: {
    fontSize: 17,
    fontFamily: FONTS.bold,
    letterSpacing: -0.3,
  },
  renameInput: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 15,
    fontFamily: FONTS.regular,
  },
  renameError: {
    fontSize: 13,
    fontFamily: FONTS.medium,
  },
  renameActions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 10,
    marginTop: 2,
  },
  renameBtn: {
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    minWidth: 78,
  },
  renameBtnPrimary: {},
  renameBtnText: {
    fontSize: 14.5,
    fontFamily: FONTS.semibold,
  },
  errorBanner: {
    flexDirection: "row", alignItems: "center", gap: 8,
    marginHorizontal: 14, marginBottom: 4,
    paddingHorizontal: 14, paddingVertical: 10, borderRadius: 14,
  },
  errorText: {
    flex: 1, color: "#fff", fontSize: 13.5, fontFamily: FONTS.medium,
  },
  // Bottom nav
  navRow: {
    flexDirection: "row",
    justifyContent: "space-around",
    paddingTop: 6,
    paddingBottom: 4,
    paddingHorizontal: 10,
  },
  navBtn: {
    flex: 1, alignItems: "center", gap: 4,
  },
  navBtnIcon: {
    width: 48, height: 48, borderRadius: 16,
    borderWidth: 1,
    alignItems: "center", justifyContent: "center",
    overflow: "hidden",
  },
  navBtnLabel: {
    fontSize: 10.5, fontFamily: FONTS.medium,
  },
  // Floating orb tooltip
  tooltip: {
    position: "absolute",
    top: 6,
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 11,
    paddingVertical: 6,
    overflow: "hidden",
    minWidth: 100,
  },
  tooltipName: {
    fontSize: 12, fontFamily: FONTS.bold, letterSpacing: 0.1,
  },
  tooltipStatus: {
    fontSize: 11, fontFamily: FONTS.regular, marginTop: 1,
  },
});
