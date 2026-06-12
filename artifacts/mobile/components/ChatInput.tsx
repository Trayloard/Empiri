import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import React, { useState } from "react";
import {
  Platform,
  Pressable,
  StyleSheet,
  TextInput,
  View,
} from "react-native";

import { useColors } from "@/hooks/useColors";

interface ChatInputProps {
  onSend: (text: string) => void;
  onMicPress: () => void;
  isRecording: boolean;
  busy: boolean;
}

export function ChatInput({
  onSend,
  onMicPress,
  isRecording,
  busy,
}: ChatInputProps) {
  const colors = useColors();
  const [text, setText] = useState("");
  const hasText = text.trim().length > 0;

  const handleSend = () => {
    if (!hasText || busy) return;
    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    onSend(text.trim());
    setText("");
  };

  const handleMic = () => {
    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }
    onMicPress();
  };

  return (
    <View style={styles.container}>
      <View
        style={[
          styles.inputRow,
          {
            backgroundColor: colors.card,
            borderColor: isRecording ? colors.primary : colors.border,
          },
        ]}
      >
        <TextInput
          style={[styles.input, { color: colors.foreground }]}
          placeholder={isRecording ? "Listening…" : "Message Empiri…"}
          placeholderTextColor={colors.mutedForeground}
          value={text}
          onChangeText={setText}
          onSubmitEditing={handleSend}
          returnKeyType="send"
          multiline
          editable={!isRecording}
          testID="chat-input"
        />

        {hasText ? (
          <Pressable
            onPress={handleSend}
            disabled={busy}
            style={({ pressed }) => [
              styles.button,
              {
                backgroundColor: colors.primary,
                opacity: busy ? 0.5 : pressed ? 0.8 : 1,
              },
            ]}
            testID="send-button"
          >
            <Feather name="arrow-up" size={20} color={colors.primaryForeground} />
          </Pressable>
        ) : (
          <Pressable
            onPress={handleMic}
            disabled={busy && !isRecording}
            style={({ pressed }) => [
              styles.button,
              {
                backgroundColor: isRecording ? colors.destructive : colors.primary,
                opacity: pressed ? 0.8 : 1,
                transform: [{ scale: isRecording ? 1.05 : 1 }],
              },
            ]}
            testID="mic-button"
          >
            <Feather
              name={isRecording ? "square" : "mic"}
              size={isRecording ? 18 : 20}
              color={colors.primaryForeground}
            />
          </Pressable>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 14,
    paddingTop: 8,
  },
  inputRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    borderWidth: 1.5,
    borderRadius: 26,
    paddingLeft: 18,
    paddingRight: 6,
    paddingVertical: 6,
    gap: 8,
  },
  input: {
    flex: 1,
    fontSize: 16,
    lineHeight: 21,
    maxHeight: 120,
    paddingTop: Platform.OS === "ios" ? 8 : 6,
    paddingBottom: Platform.OS === "ios" ? 8 : 6,
    fontFamily: "Inter_400Regular",
  },
  button: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
});
