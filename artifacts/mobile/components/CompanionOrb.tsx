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

interface CompanionOrbProps {
  status: CompanionStatus;
  size?: number;
}

const AnimatedGradient = Animated.createAnimatedComponent(LinearGradient);

export function CompanionOrb({ status, size = 132 }: CompanionOrbProps) {
  const colors = useColors();
  const scale = useSharedValue(1);
  const haloScale = useSharedValue(1);
  const haloOpacity = useSharedValue(0.5);

  useEffect(() => {
    cancelAnimation(scale);
    cancelAnimation(haloScale);
    cancelAnimation(haloOpacity);

    const config = (() => {
      switch (status) {
        case "thinking":
        case "transcribing":
          return { peak: 1.08, duration: 620, halo: 1.35, haloOp: 0.35 };
        case "listening":
          return { peak: 1.16, duration: 480, halo: 1.6, haloOp: 0.45 };
        case "speaking":
          return { peak: 1.12, duration: 360, halo: 1.45, haloOp: 0.4 };
        default:
          return { peak: 1.05, duration: 2200, halo: 1.25, haloOp: 0.3 };
      }
    })();

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
  }, [status, scale, haloScale, haloOpacity]);

  const coreStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const haloStyle = useAnimatedStyle(() => ({
    transform: [{ scale: haloScale.value }],
    opacity: haloOpacity.value,
  }));

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
        colors={[colors.accent, colors.primary]}
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
