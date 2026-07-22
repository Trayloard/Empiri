import { Feather } from "@expo/vector-icons";
import { BlurView } from "expo-blur";
import { LinearGradient } from "expo-linear-gradient";
import React, { useEffect } from "react";
import { Pressable, StyleSheet, Text, View, useColorScheme } from "react-native";
import Animated, {
  Easing,
  cancelAnimation,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from "react-native-reanimated";

import { FONTS } from "@/constants/fonts";
import { useColors } from "@/hooks/useColors";
import { hexToRgba, spectrumForWarmth } from "@/lib/accent";

interface MessageBubbleProps {
  role: string;
  content: string;
  /**
   * Smoothed personality warmth (see `useSmoothedWarmth`). Gently tints the
   * user-bubble gradient; `0` keeps the neutral brand gradient unchanged.
   */
  warmth?: number;
  /**
   * Personality-derived accent hex (from `accentForWarmth`). Tints the
   * assistant bubble border so Empiri's character is subtly present in every
   * reply. At warmth=0 this is the neutral `statusAccent`, keeping the design
   * consistent with the rest of the chrome. Omit to fall back to `glassBorder`.
   */
  accent?: string;
}

export function MessageBubble({ role, content, warmth = 0, accent }: MessageBubbleProps) {
  const colors = useColors();
  const scheme = useColorScheme();
  const isUser = role === "user";

  if (isUser) {
    const tinted = spectrumForWarmth(warmth, colors.spectrum);
    const bubbleColors: [string, string] =
      scheme === "dark"
        ? [hexToRgba(tinted[0], 0.3), hexToRgba(tinted[1], 0.3)]
        : [tinted[0], tinted[1]];

    return (
      <View style={[styles.row, { justifyContent: "flex-end" }]}>
        <LinearGradient
          colors={bubbleColors}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[
            styles.bubble,
            styles.userBubble,
            { borderColor: colors.userBubbleBorder },
          ]}
        >
          <Text style={[styles.text, { color: colors.userBubbleText }]}>
            {content}
          </Text>
        </LinearGradient>
      </View>
    );
  }

  // Assistant bubble border: personality-tinted when an accent is provided,
  // falling back to the static glass border when the parent has no warmth data.
  const assistantBorderColor = accent ? `${accent}40` : colors.glassBorder;

  return (
    <View style={[styles.row, { justifyContent: "flex-start" }]}>
      <View
        style={[
          styles.bubble,
          styles.assistantBubble,
          { backgroundColor: colors.glass, borderColor: assistantBorderColor },
        ]}
      >
        <BlurView
          intensity={28}
          tint={colors.blurTint}
          style={StyleSheet.absoluteFill}
        />
        <Text style={[styles.text, { color: colors.cardForeground }]}>
          {content}
        </Text>
      </View>
    </View>
  );
}

export function RetryBubble({
  onRetry,
  accent,
}: {
  onRetry: () => void;
  /** Personality-derived accent; falls back to the static token. */
  accent?: string;
}) {
  const colors = useColors();
  const tint = accent ?? colors.statusAccent;
  return (
    <View style={[styles.row, { justifyContent: "flex-start" }]}>
      <Pressable
        onPress={onRetry}
        testID="retry-button"
        accessibilityRole="button"
        accessibilityLabel="Try again"
        hitSlop={6}
        style={({ pressed }) => [
          styles.bubble,
          styles.assistantBubble,
          styles.retry,
          {
            backgroundColor: colors.glass,
            borderColor: colors.glassBorder,
            opacity: pressed ? 0.7 : 1,
          },
        ]}
      >
        <BlurView
          intensity={28}
          tint={colors.blurTint}
          style={StyleSheet.absoluteFill}
        />
        <Feather name="rotate-ccw" size={15} color={tint} />
        <Text style={[styles.retryText, { color: tint }]}>
          Try again
        </Text>
      </Pressable>
    </View>
  );
}

function Dot({ delay }: { delay: number }) {
  const colors = useColors();
  const reduceMotion = useReducedMotion();
  const progress = useSharedValue(0);

  useEffect(() => {
    if (reduceMotion) {
      progress.value = 0.5;
      return;
    }
    progress.value = withDelay(
      delay,
      withRepeat(
        withSequence(
          withTiming(1, { duration: 480, easing: Easing.inOut(Easing.ease) }),
          withTiming(0, { duration: 480, easing: Easing.inOut(Easing.ease) }),
        ),
        -1,
        false,
      ),
    );
    return () => cancelAnimation(progress);
  }, [progress, delay, reduceMotion]);

  const style = useAnimatedStyle(() => ({
    opacity: 0.4 + progress.value * 0.6,
    transform: [{ translateY: -progress.value * 4 }],
  }));

  return (
    <Animated.View
      style={[style, styles.dot, { backgroundColor: colors.mutedForeground }]}
    />
  );
}

export function TypingBubble() {
  const colors = useColors();
  return (
    <View style={[styles.row, { justifyContent: "flex-start" }]}>
      <View
        style={[
          styles.bubble,
          styles.assistantBubble,
          styles.typing,
          { backgroundColor: colors.glass, borderColor: colors.glassBorder },
        ]}
      >
        <BlurView
          intensity={28}
          tint={colors.blurTint}
          style={StyleSheet.absoluteFill}
        />
        <Dot delay={0} />
        <Dot delay={160} />
        <Dot delay={320} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    paddingHorizontal: 16,
    marginVertical: 5,
  },
  bubble: {
    maxWidth: "82%",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 22,
    overflow: "hidden",
  },
  userBubble: {
    borderWidth: 1,
    borderBottomRightRadius: 6,
  },
  assistantBubble: {
    borderWidth: 1,
    borderBottomLeftRadius: 6,
  },
  text: {
    fontSize: 16,
    lineHeight: 22,
    fontFamily: FONTS.regular,
  },
  typing: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 16,
  },
  retry: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
  },
  retryText: {
    fontSize: 15,
    fontFamily: FONTS.semibold,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
});
