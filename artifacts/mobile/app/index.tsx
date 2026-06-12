import { Feather } from "@expo/vector-icons";
import type { Message } from "@workspace/api-client-react";
import * as Haptics from "expo-haptics";
import { StatusBar } from "expo-status-bar";
import React, { useMemo } from "react";
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
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { ChatInput } from "@/components/ChatInput";
import { CompanionOrb } from "@/components/CompanionOrb";
import { MessageBubble, TypingBubble } from "@/components/MessageBubble";
import { useCompanion } from "@/contexts/CompanionContext";
import { useColors } from "@/hooks/useColors";
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
    mood,
    initializing,
    initError,
    error,
    isRecording,
    sendText,
    startListening,
    stopListening,
    toggleVoice,
    toggleNotifications,
    retryInit,
    dismissError,
  } = useCompanion();

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

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <StatusBar style={scheme === "dark" ? "light" : "dark"} />
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
                backgroundColor: notificationsEnabled
                  ? colors.secondary
                  : colors.muted,
                opacity: pressed ? 0.7 : 1,
              },
            ]}
            testID="notifications-toggle"
            hitSlop={8}
          >
            <Feather
              name={notificationsEnabled ? "bell" : "bell-off"}
              size={18}
              color={
                notificationsEnabled ? colors.primary : colors.mutedForeground
              }
            />
          </Pressable>

          <Pressable
            onPress={handleToggleVoice}
            style={({ pressed }) => [
              styles.voiceToggle,
              {
                backgroundColor: voiceEnabled ? colors.secondary : colors.muted,
                opacity: pressed ? 0.7 : 1,
              },
            ]}
            testID="voice-toggle"
            hitSlop={8}
          >
            <Feather
              name={voiceEnabled ? "volume-2" : "volume-x"}
              size={18}
              color={voiceEnabled ? colors.primary : colors.mutedForeground}
            />
          </Pressable>

          <CompanionOrb status={status} mood={mood.label} size={120} />
          <Text style={[styles.name, { color: colors.foreground }]}>Empiri</Text>
          <Text style={[styles.status, { color: colors.mutedForeground }]}>
            {statusLabel(status, mood.label)}
          </Text>
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
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    zIndex: 1,
  },
  notifToggle: {
    position: "absolute",
    left: 18,
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    zIndex: 1,
  },
  name: {
    fontSize: 24,
    fontFamily: "Inter_700Bold",
    marginTop: 2,
  },
  status: {
    fontSize: 14,
    fontFamily: "Inter_500Medium",
    marginTop: 2,
  },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 40,
    gap: 12,
  },
  emptyTitle: {
    fontSize: 20,
    fontFamily: "Inter_600SemiBold",
  },
  emptyText: {
    fontSize: 15,
    lineHeight: 21,
    textAlign: "center",
    fontFamily: "Inter_400Regular",
  },
  retry: {
    marginTop: 6,
    paddingHorizontal: 24,
    paddingVertical: 11,
    borderRadius: 22,
  },
  retryText: {
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
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
    fontFamily: "Inter_500Medium",
  },
});
