import React, { useEffect } from "react";
import { Platform, StyleSheet, Text, View } from "react-native";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Creature } from "@/components/Creature";
import { CreatureState } from "@/context/CompanionContext";
import { useColors } from "@/hooks/useColors";

const PILL_WIDTHS: Record<CreatureState, number> = {
  idle: 220,
  listening: 260,
  thinking: 240,
  responding: 260,
  happy: 230,
  sleepy: 200,
  sad: 220,
};

type Props = {
  state: CreatureState;
  companionName: string;
};

export function DynamicIsland({ state, companionName }: Props) {
  const insets = useSafeAreaInsets();
  const colors = useColors();

  const pillWidth = useSharedValue(220);
  const pillHeight = useSharedValue(56);
  const glowOpacity = useSharedValue(0.5);

  const STATE_GLOW: Record<CreatureState, string> = {
    idle: "#00D9FF",
    listening: "#FF8C42",
    thinking: "#7B2FBE",
    responding: "#00E676",
    happy: "#FFD700",
    sleepy: "#4A90D9",
    sad: "#64748B",
  };

  useEffect(() => {
    pillWidth.value = withSpring(PILL_WIDTHS[state], {
      damping: 18,
      stiffness: 160,
    });
    glowOpacity.value = withTiming(
      state === "idle" || state === "sleepy" ? 0.4 : 0.8,
      { duration: 400 }
    );
  }, [state]);

  const pillStyle = useAnimatedStyle(() => ({
    width: pillWidth.value,
  }));

  const glowStyle = useAnimatedStyle(() => ({
    opacity: glowOpacity.value,
  }));

  const topOffset =
    Platform.OS === "web"
      ? 67
      : insets.top > 0
      ? insets.top
      : 12;

  const glowColor = STATE_GLOW[state];

  const STATE_LABELS: Record<CreatureState, string> = {
    idle: companionName,
    listening: "Listening...",
    thinking: "Thinking...",
    responding: "Speaking...",
    happy: `${companionName}  ✦`,
    sleepy: "Zzz...",
    sad: "Hmm...",
  };

  return (
    <View
      style={[
        styles.wrapper,
        {
          paddingTop: topOffset,
          backgroundColor: colors.background,
        },
      ]}
    >
      <View style={styles.islandContainer}>
        <Animated.View style={[glowStyle, styles.glowRing, { shadowColor: glowColor }]} />
        <Animated.View
          style={[
            styles.pill,
            pillStyle,
            { backgroundColor: colors.islandBg ?? "#0A0A0F" },
          ]}
        >
          <Creature state={state} size={44} />
          <View style={styles.labelContainer}>
            <Text
              style={[
                styles.label,
                {
                  color:
                    state === "idle" || state === "sleepy"
                      ? "#00D9FF"
                      : state === "listening"
                      ? "#FF8C42"
                      : state === "thinking"
                      ? "#C084FC"
                      : state === "responding"
                      ? "#00E676"
                      : state === "sad"
                      ? "#94A3B8"
                      : "#FFD700",
                },
              ]}
              numberOfLines={1}
            >
              {STATE_LABELS[state]}
            </Text>
          </View>
        </Animated.View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    alignItems: "center",
    paddingBottom: 8,
  },
  islandContainer: {
    alignItems: "center",
    justifyContent: "center",
  },
  glowRing: {
    position: "absolute",
    width: "130%",
    height: 70,
    borderRadius: 35,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 20,
    elevation: 0,
  },
  pill: {
    height: 56,
    borderRadius: 28,
    flexDirection: "row",
    alignItems: "center",
    paddingLeft: 8,
    paddingRight: 20,
    gap: 6,
    overflow: "hidden",
  },
  labelContainer: {
    flex: 1,
  },
  label: {
    fontSize: 14,
    fontWeight: "600",
    letterSpacing: 0.3,
    fontFamily: Platform.OS === "ios" ? "Inter_600SemiBold" : undefined,
  },
});
