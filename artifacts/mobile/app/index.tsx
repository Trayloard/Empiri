import { Feather } from "@expo/vector-icons";
import type { Message } from "@workspace/api-client-react";
import { BlurView } from "expo-blur";
import * as Haptics from "expo-haptics";
import { StatusBar } from "expo-status-bar";
import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
  useColorScheme,
} from "react-native";
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
import { PresenceStatusLine } from "@/components/PresenceStatusLine";
import { FONTS } from "@/constants/fonts";
import { useCompanion } from "@/contexts/CompanionContext";
import { useColors } from "@/hooks/useColors";
import { useCompanionTraits } from "@/hooks/useCompanionTraits";
import type { MoodLabel } from "@/lib/mood";

function moodLabel(mood: MoodLabel): string {
  switch (mood) {
    case "bright":
      return "Feeling bright ✨";
    case "happy":
      return "Happy you're here";
    case "content":
      return "Here for you";
    case "low":
      return "Missing you a little";
    case "sleepy":
      return "A bit sleepy…";
  }
}

function welcomeGreeting(): string {
  const h = new Date().getHours();
  if (h < 5) return "Hello, night owl";
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}

function statusLabel(
  status: ReturnType<typeof useCompanion>["status"],
  mood: MoodLabel,
): string {
  switch (status) {
    case "listening":
      return "Listening…";
    case "transcribing":
      return "Got it…";
    case "thinking":
      return "Thinking…";
    case "speaking":
      return "Speaking…";
    default:
      return moodLabel(mood);
  }
}

export default function CompanionScreen() {
  const colors = useColors();
  const scheme = useColorScheme();
  const insets = useSafeAreaInsets();
  const {
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
  } = useCompanion();

  const traits = useCompanionTraits(conversationId);
  const [peekVisible, setPeekVisible] = useState(false);
  const [settingsVisible, setSettingsVisible] = useState(false);

  // First-launch "wake up": the presence blooms into view, then settles into
  // its resting breathing state. Reduce-motion shows it calm and instant.
  const reduceMotion = useReducedMotion();
  const bloom = useSharedValue(reduceMotion ? 1 : 0);
  useEffect(() => {
    if (reduceMotion) {
      bloom.value = 1;
      return;
    }
    bloom.value = withTiming(1, {
      duration: 1100,
      easing: Easing.out(Easing.cubic),
    });
  }, [bloom, reduceMotion]);
  const presenceStyle = useAnimatedStyle(() => ({
    opacity: bloom.value,
    transform: [{ scale: 0.72 + bloom.value * 0.28 }],
  }));

  const greeting = useMemo(() => welcomeGreeting(), []);

  const topPad = Platform.OS === "web" ? 24 : insets.top + 8;
  const bottomPad = Platform.OS === "web" ? 20 : insets.bottom + 6;

  const reversed = useMemo(() => [...messages].reverse(), [messages]);
  const busy =
    status === "thinking" ||
    status === "transcribing" ||
    status === "speaking";

  const handleMic = () => {
    if (isRecording) {
      stopListening();
    } else {
      startListening();
    }
  };

  const handleRetry = () => {
    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    retryMessage();
  };

  const handleToggleVoice = () => {
    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    toggleVoice();
  };

  const handleToggleNotifications = () => {
    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    toggleNotifications();
  };

  const handleOpenPeek = () => {
    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    setPeekVisible(true);
  };

  const handleOpenSettings = () => {
    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    setSettingsVisible(true);
  };

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <StatusBar style={scheme === "dark" ? "light" : "dark"} />
      <AmbientGlow status={status} traits={traits} />
      <KeyboardAvoidingView
        style={styles.flex}
        behavior="padding"
        keyboardVerticalOffset={0}
      >
        {/* Header with the companion presence */}
        <View style={[styles.header, { paddingTop: topPad }]}>
          <Pressable
            onPress={handleToggleNotifications}
            style={({ pressed }) => [
              styles.notifToggle,
              {
                backgroundColor: colors.glass,
                borderColor: colors.glassBorder,
                opacity: pressed ? 0.7 : 1,
              },
            ]}
            testID="notifications-toggle"
            hitSlop={8}
          >
            <BlurView
              intensity={24}
              tint={colors.blurTint}
              style={StyleSheet.absoluteFill}
            />
            <Feather
              name={notificationsEnabled ? "bell" : "bell-off"}
              size={18}
              color={
                notificationsEnabled ? colors.statusAccent : colors.mutedForeground
              }
            />
          </Pressable>

          <Pressable
            onPress={handleOpenSettings}
            style={({ pressed }) => [
              styles.settingsToggle,
              {
                backgroundColor: colors.glass,
                borderColor: colors.glassBorder,
                opacity: pressed ? 0.7 : 1,
              },
            ]}
            testID="check-in-settings-button"
            accessibilityRole="button"
            accessibilityLabel="Check-in settings"
            hitSlop={8}
          >
            <BlurView
              intensity={24}
              tint={colors.blurTint}
              style={StyleSheet.absoluteFill}
            />
            <Feather name="settings" size={18} color={colors.mutedForeground} />
          </Pressable>

          <Pressable
            onPress={handleToggleVoice}
            style={({ pressed }) => [
              styles.voiceToggle,
              {
                backgroundColor: colors.glass,
                borderColor: colors.glassBorder,
                opacity: pressed ? 0.7 : 1,
              },
            ]}
            testID="voice-toggle"
            hitSlop={8}
          >
            <BlurView
              intensity={24}
              tint={colors.blurTint}
              style={StyleSheet.absoluteFill}
            />
            <Feather
              name={voiceEnabled ? "volume-2" : "volume-x"}
              size={18}
              color={voiceEnabled ? colors.statusAccent : colors.mutedForeground}
            />
          </Pressable>

          <Animated.View style={[styles.presence, presenceStyle]}>
            <Pressable
              onPress={handleOpenPeek}
              testID="inner-self-button"
              accessibilityRole="button"
              accessibilityLabel="Peek inside Empiri"
              hitSlop={8}
            >
              <CompanionOrb status={status} mood={mood.label} size={120} traits={traits} />
            </Pressable>
            <Text style={[styles.name, { color: colors.foreground }]}>
              Empiri
            </Text>
          </Animated.View>
          <PresenceStatusLine
            greeting={greeting}
            statusText={statusLabel(status, mood.label)}
            color={colors.statusAccent}
          />
        </View>

        {/* Conversation */}
        <View style={styles.flex}>
          {initializing ? (
            <View style={styles.center}>
              <ActivityIndicator color={colors.primary} />
            </View>
          ) : initError ? (
            <View style={styles.center}>
              <Feather
                name="cloud-off"
                size={36}
                color={colors.mutedForeground}
              />
              <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>
                {initError}
              </Text>
              <Pressable
                onPress={retryInit}
                style={[styles.retry, { backgroundColor: colors.primary }]}
              >
                <Text
                  style={[styles.retryText, { color: colors.primaryForeground }]}
                >
                  Retry
                </Text>
              </Pressable>
            </View>
          ) : messages.length === 0 ? (
            <View style={styles.center}>
              <Text style={[styles.emptyTitle, { color: colors.foreground }]}>
                Say hi to Empiri
              </Text>
              <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>
                Type a message or tap the mic to talk. I'm always here for a
                chat.
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
                  <RetryBubble onRetry={handleRetry} />
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
            style={[
              styles.errorBanner,
              { backgroundColor: colors.destructive },
            ]}
          >
            <Feather name="alert-circle" size={15} color="#fff" />
            <Text style={styles.errorText}>{error}</Text>
            <Feather name="x" size={15} color="#fff" />
          </Pressable>
        ) : null}

        {/* Input */}
        <View style={{ paddingBottom: bottomPad }}>
          <ChatInput
            onSend={sendText}
            onMicPress={handleMic}
            isRecording={isRecording}
            busy={busy}
          />
        </View>
      </KeyboardAvoidingView>

      <InnerSelfSheet
        visible={peekVisible}
        conversationId={conversationId}
        onClose={() => setPeekVisible(false)}
      />

      <CheckInSettingsSheet
        visible={settingsVisible}
        cadence={checkInCadence}
        onSelect={setCheckInCadence}
        onClose={() => setSettingsVisible(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  flex: { flex: 1 },
  header: {
    alignItems: "center",
    paddingBottom: 10,
  },
  voiceToggle: {
    position: "absolute",
    right: 18,
    width: 42,
    height: 42,
    borderRadius: 21,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    zIndex: 2,
  },
  notifToggle: {
    position: "absolute",
    left: 18,
    width: 42,
    height: 42,
    borderRadius: 21,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    zIndex: 2,
  },
  settingsToggle: {
    position: "absolute",
    left: 66,
    width: 42,
    height: 42,
    borderRadius: 21,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    zIndex: 2,
  },
  presence: {
    alignItems: "center",
  },
  name: {
    fontSize: 26,
    fontFamily: FONTS.bold,
    letterSpacing: -0.4,
    marginTop: 4,
  },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 40,
    gap: 12,
  },
  emptyTitle: {
    fontSize: 21,
    fontFamily: FONTS.bold,
    letterSpacing: -0.3,
  },
  emptyText: {
    fontSize: 15,
    lineHeight: 21,
    textAlign: "center",
    fontFamily: FONTS.regular,
  },
  retry: {
    marginTop: 6,
    paddingHorizontal: 24,
    paddingVertical: 11,
    borderRadius: 22,
  },
  retryText: {
    fontSize: 15,
    fontFamily: FONTS.semibold,
  },
  listContent: {
    paddingVertical: 12,
  },
  errorBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginHorizontal: 14,
    marginBottom: 4,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 14,
  },
  errorText: {
    flex: 1,
    color: "#fff",
    fontSize: 13.5,
    fontFamily: FONTS.medium,
  },
});
