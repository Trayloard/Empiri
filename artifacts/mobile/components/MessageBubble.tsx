import React, { useEffect } from "react";
import { StyleSheet, Text, View } from "react-native";
import Animated, {
  Easing,
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from "react-native-reanimated";

import { useColors } from "@/hooks/useColors";

interface MessageBubbleProps {
  role: string;
  content: string;
}

export function MessageBubble({ role, content }: MessageBubbleProps) {
  const colors = useColors();
  const isUser = role === "user";

  return (
    <View
      style={[
        styles.row,
        { justifyContent: isUser ? "flex-end" : "flex-start" },
      ]}
    >
      <View
        style={[
          styles.bubble,
          isUser
            ? {
                backgroundColor: colors.primary,
                borderBottomRightRadius: 6,
              }
            : {
                backgroundColor: colors.card,
                borderColor: colors.border,
                borderWidth: 1,
                borderBottomLeftRadius: 6,
              },
        ]}
      >
        <Text
          style={[
            styles.text,
            { color: isUser ? colors.primaryForeground : colors.cardForeground },
          ]}
        >
          {content}
        </Text>
      </View>
    </View>
  );
}

function Dot({ delay }: { delay: number }) {
  const colors = useColors();
  const opacity = useSharedValue(0.3);

  useEffect(() => {
    opacity.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 400, easing: Easing.inOut(Easing.ease) }),
        withTiming(0.3, { duration: 400, easing: Easing.inOut(Easing.ease) }),
      ),
      -1,
      false,
    );
    return () => cancelAnimation(opacity);
  }, [opacity]);

  const style = useAnimatedStyle(() => ({ opacity: opacity.value }));

  return (
    <Animated.View
      style={[
        style,
        { animationDelay: delay } as object,
        styles.dot,
        { backgroundColor: colors.mutedForeground },
      ]}
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
          styles.typing,
          {
            backgroundColor: colors.card,
            borderColor: colors.border,
            borderWidth: 1,
            borderBottomLeftRadius: 6,
          },
        ]}
      >
        <Dot delay={0} />
        <Dot delay={150} />
        <Dot delay={300} />
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
    paddingVertical: 11,
    borderRadius: 22,
  },
  text: {
    fontSize: 16,
    lineHeight: 22,
    fontFamily: "Inter_400Regular",
  },
  typing: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingVertical: 15,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
});
