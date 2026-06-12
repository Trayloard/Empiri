import { LinearGradient } from "expo-linear-gradient";
import React, { useEffect } from "react";
import { StyleSheet, View } from "react-native";
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
import type { CompanionStatus } from "@/contexts/CompanionContext";
import type { MoodLabel } from "@/lib/mood";

interface CompanionOrbProps {
  status: CompanionStatus;
  mood?: MoodLabel;
  size?: number;
}

const AnimatedGradient = Animated.createAnimatedComponent(LinearGradient);

interface OrbConfig {
  peak: number;
  duration: number;
  halo: number;
  haloOp: number;
  opacity: number;
}

const MOOD_CONFIG: Record<MoodLabel, OrbConfig> = {
  bright: { peak: 1.08, duration: 1500, halo: 1.4, haloOp: 0.42, opacity: 1 },
  happy: { peak: 1.06, duration: 1900, halo: 1.32, haloOp: 0.36, opacity: 1 },
  content: { peak: 1.05, duration: 2400, halo: 1.24, haloOp: 0.3, opacity: 0.96 },
  low: { peak: 1.035, duration: 3400, halo: 1.16, haloOp: 0.2, opacity: 0.82 },
  sleepy: { peak: 1.02, duration: 4600, halo: 1.1, haloOp: 0.13, opacity: 0.62 },
};

export function CompanionOrb({
  status,
  mood = "content",
  size = 132,
}: CompanionOrbProps) {
  const colors = useColors();
  const scale = useSharedValue(1);
  const haloScale = useSharedValue(1);
  const haloOpacity = useSharedValue(0.5);
  const coreOpacity = useSharedValue(1);

  useEffect(() => {
    cancelAnimation(scale);
    cancelAnimation(haloScale);
    cancelAnimation(haloOpacity);
    cancelAnimation(coreOpacity);

    // Active states get their own lively rhythm; at rest the companion's
    // mood drives how bright and bouncy it looks.
    const config: OrbConfig = (() => {
      switch (status) {
        case "thinking":
        case "transcribing":
          return { peak: 1.08, duration: 620, halo: 1.35, haloOp: 0.35, opacity: 1 };
        case "listening":
          return { peak: 1.16, duration: 480, halo: 1.6, haloOp: 0.45, opacity: 1 };
        case "speaking":
          return { peak: 1.12, duration: 360, halo: 1.45, haloOp: 0.4, opacity: 1 };
        default:
          return MOOD_CONFIG[mood];
      }
    })();

    coreOpacity.value = withTiming(config.opacity, { duration: 600 });

    scale.value = withRepeat(
      withSequence(
        withTiming(config.peak, {
          duration: config.duration,
          easing: Easing.inOut(Easing.ease),
        }),
        withTiming(1, {
          duration: config.duration,
          easing: Easing.inOut(Easing.ease),
        }),
      ),
      -1,
      false,
    );

    haloScale.value = withRepeat(
      withSequence(
        withTiming(config.halo, {
          duration: config.duration,
          easing: Easing.out(Easing.ease),
        }),
        withTiming(1, {
          duration: config.duration,
          easing: Easing.in(Easing.ease),
        }),
      ),
      -1,
      false,
    );

    haloOpacity.value = withRepeat(
      withSequence(
        withTiming(config.haloOp, { duration: config.duration }),
        withTiming(0.12, { duration: config.duration }),
      ),
      -1,
      false,
    );
  }, [status, mood, scale, haloScale, haloOpacity, coreOpacity]);

  const coreStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
    opacity: coreOpacity.value,
  }));

  const haloStyle = useAnimatedStyle(() => ({
    transform: [{ scale: haloScale.value }],
    opacity: haloOpacity.value,
  }));

  // A faded companion cools toward muted tones; a happy one glows warm.
  const isResting = status === "idle";
  const dim = isResting && (mood === "sleepy" || mood === "low");
  const gradientColors: [string, string] = dim
    ? [colors.secondary, colors.accent]
    : [colors.accent, colors.primary];

  return (
    <View style={[styles.wrap, { width: size * 1.7, height: size * 1.7 }]}>
      <Animated.View
        style={[
          styles.halo,
          haloStyle,
          {
            width: size,
            height: size,
            borderRadius: size / 2,
            backgroundColor: colors.accent,
          },
        ]}
      />
      <AnimatedGradient
        colors={gradientColors}
        start={{ x: 0.2, y: 0 }}
        end={{ x: 0.8, y: 1 }}
        style={[
          styles.core,
          coreStyle,
          {
            width: size,
            height: size,
            borderRadius: size / 2,
            shadowColor: colors.primary,
          },
        ]}
      >
        <View
          style={[
            styles.shine,
            {
              width: size * 0.32,
              height: size * 0.32,
              borderRadius: size * 0.16,
            },
          ]}
        />
      </AnimatedGradient>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: "center",
    justifyContent: "center",
  },
  halo: {
    position: "absolute",
  },
  core: {
    alignItems: "center",
    justifyContent: "center",
    shadowOpacity: 0.45,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 10 },
    elevation: 12,
  },
  shine: {
    position: "absolute",
    top: "18%",
    left: "20%",
    backgroundColor: "rgba(255,255,255,0.45)",
  },
});
