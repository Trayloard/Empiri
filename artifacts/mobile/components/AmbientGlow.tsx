import React, { useEffect, useMemo } from "react";
import type { StyleProp, ViewStyle } from "react-native";
import { StyleSheet, useWindowDimensions } from "react-native";
import Animated, {
  Easing,
  useAnimatedStyle,
  useDerivedValue,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";

import { GlowBlob } from "@/components/GlowBlob";
import { useColors } from "@/hooks/useColors";
import {
  useSmoothedTraitInfluence,
  type SmoothedTraitInfluence,
} from "@/hooks/useSmoothedTraitInfluence";
import type { CompanionStatus } from "@/contexts/CompanionContext";
import {
  ambientBlobOpacity,
  type AmbientBlobKind,
} from "@/lib/orbOpacity";
import {
  NEUTRAL_INFLUENCE,
  type TraitInfluence,
} from "@/lib/traitInfluence";

interface AmbientGlowProps {
  status: CompanionStatus;
  /** Personality-derived influence — layered on top of mood/activity dynamics. */
  traits?: TraitInfluence;
}

interface AmbientBlobConfig {
  id: string;
  kind: AmbientBlobKind;
  color: string;
  size: number;
  left: number;
  top: number;
  duration: number;
  drift: number;
  delay: number;
}

interface AmbientBlobProps {
  kind: AmbientBlobKind;
  /** Snappy brightness from activity state (no trait influence). */
  baseIntensity: number;
  /** Eased trait influence — read on the UI thread. */
  traits: SmoothedTraitInfluence;
  id: string;
  color: string;
  size: number;
  duration: number;
  drift: number;
  scaleTo: number;
  delay: number;
  innerStop: number;
  reduceMotion: boolean;
  style?: StyleProp<ViewStyle>;
}

/**
 * One ambient blob. Activity brightness (`baseIntensity`) stays snappy in JS;
 * the personality contribution (warm/cool balance + glow) is read from eased
 * shared values inside a worklet, so a trait shift cross-fades while an
 * activity change still lands instantly. Reproduces the original per-blob
 * opacity formulas exactly.
 */
function AmbientBlob({
  kind,
  baseIntensity,
  traits,
  ...glow
}: AmbientBlobProps) {
  const opacity = useDerivedValue(() =>
    ambientBlobOpacity(
      kind,
      baseIntensity,
      traits.glowBoost.value,
      traits.warmthShift.value,
    ),
  );

  return <GlowBlob opacity={opacity} {...glow} />;
}

/**
 * An Apple-Intelligence-style iridescent ambient glow that lives behind the
 * whole screen, so the app always feels awake. It breathes gently at rest and
 * intensifies + quickens during active states (listening / thinking /
 * speaking). Pointer-transparent and purely decorative.
 *
 * Empiri's evolving personality subtly shapes the glow: a warmer companion
 * warms the palette, a livelier one breathes a little faster, and a curious
 * one glows a touch brighter — all layered on top of the activity dynamics,
 * and eased gently so a personality shift cross-fades instead of snapping.
 */
export function AmbientGlow({
  status,
  traits = NEUTRAL_INFLUENCE,
}: AmbientGlowProps) {
  const colors = useColors();
  const reduceMotion = useReducedMotion();
  const { width, height } = useWindowDimensions();
  const smoothed = useSmoothedTraitInfluence(traits);

  const active = status !== "idle";
  const baseIntensity = active ? 1 : 0.6;
  const baseSpeed = active ? (status === "listening" ? 2.2 : 1.8) : 1;

  // Breathing cadence carries a small liveliness boost. It feeds the GlowBlob
  // animation loop (rebuilt on change), so it stays derived from the settled
  // target trait rather than an eased value — see CompanionOrb for the why.
  const speed = baseSpeed * (1 + traits.livelinessBoost * 0.45);

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

  const blobs = useMemo<AmbientBlobConfig[]>(
    () => [
      {
        id: "amb-top",
        kind: "top",
        color: purple,
        size: width * 1.25,
        left: width * 0.5 - width * 0.625,
        top: -height * 0.12,
        duration: dur(7000),
        drift: 26,
        delay: 0,
      },
      {
        id: "amb-left",
        kind: "left",
        color: blue,
        size: width * 0.95,
        left: -width * 0.45,
        top: height * 0.18,
        duration: dur(8000),
        drift: 30,
        delay: 400,
      },
      {
        id: "amb-right",
        kind: "right",
        color: pink,
        size: width * 0.95,
        left: width * 0.5,
        top: height * 0.06,
        duration: dur(9000),
        drift: 28,
        delay: 900,
      },
      {
        id: "amb-bottom",
        kind: "bottom",
        color: blue,
        size: width * 1.1,
        left: width * 0.5 - width * 0.55,
        top: height * 0.72,
        duration: dur(9500),
        drift: 24,
        delay: 1300,
      },
    ],
    [width, height, blue, purple, pink, speed],
  );

  return (
    <Animated.View
      style={[StyleSheet.absoluteFill, { pointerEvents: "none" }, enterStyle]}
    >
      {blobs.map((b) => (
        <AmbientBlob
          key={b.id}
          kind={b.kind}
          baseIntensity={baseIntensity}
          traits={smoothed}
          id={b.id}
          color={b.color}
          size={b.size}
          duration={b.duration}
          drift={b.drift}
          scaleTo={active ? 1.22 : 1.12}
          delay={b.delay}
          innerStop={38}
          reduceMotion={reduceMotion}
          style={{ left: b.left, top: b.top }}
        />
      ))}
    </Animated.View>
  );
}
