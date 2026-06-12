import React, { useEffect, useMemo } from "react";
import { StyleSheet, useWindowDimensions } from "react-native";
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";

import { GlowBlob } from "@/components/GlowBlob";
import { useColors } from "@/hooks/useColors";
import type { CompanionStatus } from "@/contexts/CompanionContext";
import {
  NEUTRAL_INFLUENCE,
  type TraitInfluence,
} from "@/lib/traitInfluence";

interface AmbientGlowProps {
  status: CompanionStatus;
  /** Personality-derived influence — layered on top of mood/activity dynamics. */
  traits?: TraitInfluence;
}

/**
 * An Apple-Intelligence-style iridescent ambient glow that lives behind the
 * whole screen, so the app always feels awake. It breathes gently at rest and
 * intensifies + quickens during active states (listening / thinking /
 * speaking). Pointer-transparent and purely decorative.
 *
 * Empiri's evolving personality subtly shapes the glow: a warmer companion
 * warms the palette, a livelier one breathes a little faster, and a curious
 * one glows a touch brighter — all layered on top of the activity dynamics.
 */
export function AmbientGlow({
  status,
  traits = NEUTRAL_INFLUENCE,
}: AmbientGlowProps) {
  const colors = useColors();
  const reduceMotion = useReducedMotion();
  const { width, height } = useWindowDimensions();

  const active = status !== "idle";
  const baseIntensity = active ? 1 : 0.6;
  const baseSpeed = active ? (status === "listening" ? 2.2 : 1.8) : 1;

  // Layer trait influence on top of activity dynamics.
  const intensity = Math.min(1, baseIntensity + traits.glowBoost * 0.7);
  const speed = baseSpeed * (1 + traits.livelinessBoost * 0.45);

  // Warm-palette shift: boost pink, soften blue when warmth is high.
  const warmBoost = Math.max(0, traits.warmthShift);
  const coolDamp = Math.max(0, -traits.warmthShift);

  const dur = (base: number) => Math.round(base / speed);

  // On cold start the ambient field blooms in so the app wakes up gently.
  const enter = useSharedValue(reduceMotion ? 1 : 0);
  useEffect(() => {
    if (reduceMotion) {
      enter.value = 1;
      return;
    }
    enter.value = withTiming(1, {
      duration: 1500,
      easing: Easing.out(Easing.cubic),
    });
  }, [enter, reduceMotion]);
  const enterStyle = useAnimatedStyle(() => ({ opacity: enter.value }));

  const [blue, purple, pink] = colors.ambient;

  const blobs = useMemo(
    () => [
      {
        id: "amb-top",
        color: purple,
        size: width * 1.25,
        left: width * 0.5 - width * 0.625,
        top: -height * 0.12,
        duration: dur(7000),
        drift: 26,
        // Purple is neutral on the warm/cool axis — intensity drives it
        op: 0.5 * intensity,
        delay: 0,
      },
      {
        id: "amb-left",
        color: blue,
        size: width * 0.95,
        left: -width * 0.45,
        top: height * 0.18,
        duration: dur(8000),
        drift: 30,
        // Blue recedes as warmth trait rises
        op: Math.max(0.15, 0.4 * intensity - coolDamp * 0.25),
        delay: 400,
      },
      {
        id: "amb-right",
        color: pink,
        size: width * 0.95,
        left: width * 0.5,
        top: height * 0.06,
        duration: dur(9000),
        drift: 28,
        // Pink is boosted by warmth trait
        op: Math.min(0.75, 0.38 * intensity + warmBoost * 0.3),
        delay: 900,
      },
      {
        id: "amb-bottom",
        color: blue,
        size: width * 1.1,
        left: width * 0.5 - width * 0.55,
        top: height * 0.72,
        duration: dur(9500),
        drift: 24,
        op: Math.max(0.1, 0.3 * intensity - coolDamp * 0.2),
        delay: 1300,
      },
    ],
    [width, height, blue, purple, pink, intensity, speed, warmBoost, coolDamp],
  );

  return (
    <Animated.View
      style={[StyleSheet.absoluteFill, { pointerEvents: "none" }, enterStyle]}
    >
      {blobs.map((b) => (
        <GlowBlob
          key={b.id}
          id={b.id}
          color={b.color}
          size={b.size}
          duration={b.duration}
          drift={b.drift}
          scaleTo={active ? 1.22 : 1.12}
          delay={b.delay}
          opacity={Math.min(1, b.op)}
          innerStop={38}
          reduceMotion={reduceMotion}
          style={{ left: b.left, top: b.top }}
        />
      ))}
    </Animated.View>
  );
}
