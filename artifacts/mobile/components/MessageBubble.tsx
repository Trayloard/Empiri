import { Feather } from "@expo/vector-icons";
import { BlurView } from "expo-blur";
import { LinearGradient } from "expo-linear-gradient";
import React, { useEffect } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
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

interface MessageBubbleProps {
  role: string;
  content: string;
}

export function MessageBubble({ role, content }: MessageBubbleProps) {
  const colors = useColors();
  const isUser = role === "user";

  if (isUser) {
    return (
      <View style={[styles.row, { justifyContent: "flex-end" }]}>
        <LinearGradient
          colors={colors.userBubble}
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

  return (
    <View style={[styles.row, { justifyContent: "flex-start" }]}>
      <View
        style={[
          styles.bubble,
          styles.assistantBubble,
          { backgroundColor: colors.glass, borderColor: colors.glassBorder },
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

export function RetryBubble({ onRetry }: { onRetry: () => void }) {
  const colors = useColors();
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
        <Feather name="rotate-ccw" size={15} color={colors.statusAccent} />
        <Text style={[styles.retryText, { color: colors.statusAccent }]}>
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
