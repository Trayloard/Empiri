import { Feather } from "@expo/vector-icons";
import { BlurView } from "expo-blur";
import * as Haptics from "expo-haptics";
import { LinearGradient } from "expo-linear-gradient";
import React, { useEffect, useRef, useState } from "react";
import {
  Platform,
  Pressable,
  StyleSheet,
  TextInput,
  View,
} from "react-native";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import type { MutableRefObject } from "react";

import { FONTS } from "@/constants/fonts";
import { useColors } from "@/hooks/useColors";
import { accentForWarmth, spectrumForWarmth } from "@/lib/accent";

/** Duration of the hold needed to enter audio-call mode (ms). */
const HOLD_DURATION_MS = 3000;

interface ChatInputProps {
  onSend: (text: string) => void;
  onMicPress: () => void;
  /** Called when the mic button has been held for 3 seconds. Launches call mode. */
  onMicLongPress?: () => void;
  isRecording: boolean;
  /** True while an audio-call loop is active — disables the mic button's tap/hold. */
  isCallActive?: boolean;
  busy: boolean;
  /**
   * Smoothed personality warmth (see `useSmoothedWarmth`). Gently tints the
   * send/mic gradient toward the personality's warm/cool pole; `0` (or
   * omitted) keeps today's exact brand gradient.
   */
  warmth?: number;
  /**
   * Ref supplied by CompanionContext whose `.current` is the normalised
   * microphone volume (0 = silent, 1 = loud). Updated by the native metering
   * callback — reading it here keeps the animation off the React render cycle.
   */
  micVolumeRef?: MutableRefObject<number>;
}

export function ChatInput({
  onSend,
  onMicPress,
  onMicLongPress,
  isRecording,
  isCallActive = false,
  busy,
  warmth = 0,
  micVolumeRef,
}: ChatInputProps) {
  const colors = useColors();
  const [text, setText] = useState("");
  const hasText = text.trim().length > 0;

  const spectrum = spectrumForWarmth(warmth, colors.spectrum);
  const glowColor = accentForWarmth(warmth, colors.spectrum[1], colors.spectrum);

  // ── Volume-reactive pulse animation ──────────────────────────────────────
  // pulseScale drives the recording button's scale (1.0 = silent, up to 1.18
  // at full volume). The effect polls the micVolumeRef every 120 ms — refs
  // don't re-render React, so we poll from a JS interval and hand off to
  // Reanimated via withTiming for buttery smooth native animation.
  const pulseScale = useSharedValue(1);

  useEffect(() => {
    if (!isRecording || !micVolumeRef) {
      pulseScale.value = withTiming(1, { duration: 200, easing: Easing.out(Easing.quad) });
      return;
    }
    const id = setInterval(() => {
      const vol = micVolumeRef.current; // 0–1
      // Scale between 1.0 (silence) and 1.18 (loud).
      pulseScale.value = withTiming(1 + vol * 0.18, {
        duration: 110,
        easing: Easing.out(Easing.quad),
      });
    }, 120);
    return () => {
      clearInterval(id);
      pulseScale.value = withTiming(1, { duration: 200, easing: Easing.out(Easing.quad) });
    };
  }, [isRecording, micVolumeRef, pulseScale]);

  const pulseButtonStyle = useAnimatedStyle(() => ({
    transform: [{ scale: pulseScale.value }],
  }));

  // Glow ring: expands and fades-in proportionally to the current scale.
  const pulseRingStyle = useAnimatedStyle(() => {
    const excess = pulseScale.value - 1; // 0 → 0.18
    return {
      opacity: excess * 5.5,           // 0 when silent, ~1 when loud
      transform: [{ scale: pulseScale.value * 1.25 }],
    };
  });

  // Hold-to-call progress ring: fills over HOLD_DURATION_MS while the mic
  // button is pressed and held. Resets immediately on release or activation.
  const holdProgress = useSharedValue(0);
  const longPressFiredRef = useRef(false);

  const holdRingStyle = useAnimatedStyle(() => ({
    opacity: holdProgress.value * 0.9,
    transform: [{ scale: 0.92 + holdProgress.value * 0.12 }],
  }));

  const handleSend = () => {
    if (!hasText || busy) return;
    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    onSend(text.trim());
    setText("");
  };

  const handleMic = () => {
    // If the long-press just fired in this press cycle, suppress the tap so
    // onMicPress and onMicLongPress are mutually exclusive per press.
    if (longPressFiredRef.current) return;
    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }
    onMicPress();
  };

  const handlePressIn = () => {
    if (isCallActive || !onMicLongPress) return;
    longPressFiredRef.current = false;
    holdProgress.value = withTiming(1, {
      duration: HOLD_DURATION_MS,
      easing: Easing.linear,
    });
  };

  const handlePressOut = () => {
    if (!longPressFiredRef.current) {
      holdProgress.value = withTiming(0, { duration: 200 });
    }
  };

  const handleLongPress = () => {
    if (isCallActive || !onMicLongPress) return;
    longPressFiredRef.current = true;
    holdProgress.value = withTiming(0, { duration: 200 });
    if (Platform.OS !== "web") {
      Haptics.notificationAsync(
        Haptics.NotificationFeedbackType.Success,
      ).catch(() => {});
    }
    onMicLongPress();
  };

  return (
    <View style={styles.container}>
      <View
        style={[
          styles.inputRow,
          {
            backgroundColor: colors.glass,
            borderColor:
              isRecording || isCallActive
                ? colors.primary
                : colors.glassBorder,
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
          placeholder={
            isCallActive
              ? "Call in progress…"
              : isRecording
                ? "Listening…"
                : "Message Empiri…"
          }
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
                shadowColor: glowColor,
              },
            ]}
            testID="send-button"
          >
            <LinearGradient
              colors={spectrum}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.button}
            >
              <Feather name="arrow-up" size={20} color="#FFFFFF" />
            </LinearGradient>
          </Pressable>
        ) : (
          <View style={styles.micWrap}>
            {/* Volume-reactive glow ring — visible only while recording */}
            {isRecording ? (
              <Animated.View
                style={[
                  styles.holdRing,
                  { borderColor: colors.destructive },
                  pulseRingStyle,
                ]}
                pointerEvents="none"
              />
            ) : null}
            {/* Hold-to-call progress ring — fills during the 3s hold */}
            {onMicLongPress && !isCallActive ? (
              <Animated.View
                style={[
                  styles.holdRing,
                  { borderColor: glowColor },
                  holdRingStyle,
                ]}
                pointerEvents="none"
                testID="mic-hold-ring"
              />
            ) : null}
            {/* Animated wrapper drives the volume-reactive scale */}
            <Animated.View style={isRecording ? pulseButtonStyle : undefined}>
              <Pressable
                onPress={handleMic}
                onPressIn={handlePressIn}
                onPressOut={handlePressOut}
                onLongPress={handleLongPress}
                delayLongPress={HOLD_DURATION_MS}
                disabled={(busy && !isRecording) || isCallActive}
                style={({ pressed }) => [
                  styles.buttonWrap,
                  {
                    opacity: pressed ? 0.8 : 1,
                    shadowColor: isRecording ? colors.destructive : glowColor,
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
                ) : isCallActive ? (
                  <LinearGradient
                    colors={spectrum}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={styles.button}
                  >
                    <Feather name="phone" size={18} color="#FFFFFF" />
                  </LinearGradient>
                ) : (
                  <LinearGradient
                    colors={spectrum}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={styles.button}
                  >
                    <Feather name="mic" size={20} color="#FFFFFF" />
                  </LinearGradient>
                )}
              </Pressable>
            </Animated.View>
          </View>
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
  micWrap: {
    position: "relative",
    alignItems: "center",
    justifyContent: "center",
  },
  holdRing: {
    position: "absolute",
    top: -7,
    bottom: -7,
    left: -7,
    right: -7,
    borderRadius: 28,
    borderWidth: 2.5,
    pointerEvents: "none",
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
