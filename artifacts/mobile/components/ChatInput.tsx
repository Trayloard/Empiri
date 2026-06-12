import { Feather } from "@expo/vector-icons";
import { BlurView } from "expo-blur";
import * as Haptics from "expo-haptics";
import { LinearGradient } from "expo-linear-gradient";
import React, { useState } from "react";
import {
  Platform,
  Pressable,
  StyleSheet,
  TextInput,
  View,
} from "react-native";

import { FONTS } from "@/constants/fonts";
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
            backgroundColor: colors.glass,
            borderColor: isRecording ? colors.primary : colors.glassBorder,
          },
        ]}
      >
        <BlurView
          intensity={30}
          tint={colors.blurTint}
          style={StyleSheet.absoluteFill}
        />
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
              styles.buttonWrap,
              {
                opacity: busy ? 0.5 : pressed ? 0.8 : 1,
                shadowColor: colors.spectrum[1],
              },
            ]}
            testID="send-button"
          >
            <LinearGradient
              colors={colors.spectrum}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.button}
            >
              <Feather name="arrow-up" size={20} color="#FFFFFF" />
            </LinearGradient>
          </Pressable>
        ) : (
          <Pressable
            onPress={handleMic}
            disabled={busy && !isRecording}
            style={({ pressed }) => [
              styles.buttonWrap,
              {
                opacity: pressed ? 0.8 : 1,
                transform: [{ scale: isRecording ? 1.05 : 1 }],
                shadowColor: isRecording
                  ? colors.destructive
                  : colors.spectrum[1],
              },
            ]}
            testID="mic-button"
          >
            {isRecording ? (
              <View
                style={[
                  styles.button,
                  { backgroundColor: colors.destructive },
                ]}
              >
                <Feather name="square" size={18} color="#FFFFFF" />
              </View>
            ) : (
              <LinearGradient
                colors={colors.spectrum}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.button}
              >
                <Feather name="mic" size={20} color="#FFFFFF" />
              </LinearGradient>
            )}
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
    borderRadius: 28,
    paddingLeft: 18,
    paddingRight: 6,
    paddingVertical: 6,
    gap: 8,
    overflow: "hidden",
  },
  input: {
    flex: 1,
    fontSize: 16,
    lineHeight: 21,
    maxHeight: 120,
    paddingTop: Platform.OS === "ios" ? 8 : 6,
    paddingBottom: Platform.OS === "ios" ? 8 : 6,
    fontFamily: FONTS.regular,
  },
  buttonWrap: {
    borderRadius: 21,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.55,
    shadowRadius: 10,
    elevation: 6,
  },
  button: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: "center",
    justifyContent: "center",
  },
});
