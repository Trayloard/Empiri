import React, { useMemo } from "react";
import { StyleSheet, View, useWindowDimensions } from "react-native";
import { useReducedMotion } from "react-native-reanimated";

import { GlowBlob } from "@/components/GlowBlob";
import { useColors } from "@/hooks/useColors";
import type { CompanionStatus } from "@/contexts/CompanionContext";

interface AmbientGlowProps {
  status: CompanionStatus;
}

/**
 * An Apple-Intelligence-style iridescent ambient glow that lives behind the
 * whole screen, so the app always feels awake. It breathes gently at rest and
 * intensifies + quickens during active states (listening / thinking /
 * speaking). Pointer-transparent and purely decorative.
 */
export function AmbientGlow({ status }: AmbientGlowProps) {
  const colors = useColors();
  const reduceMotion = useReducedMotion();
  const { width, height } = useWindowDimensions();

  const active = status !== "idle";
  const intensity = active ? 1 : 0.6;
  const speed = active ? (status === "listening" ? 2.2 : 1.8) : 1;
  const dur = (base: number) => Math.round(base / speed);

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
        op: 0.4 * intensity,
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
        op: 0.38 * intensity,
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
        op: 0.3 * intensity,
        delay: 1300,
      },
    ],
    [width, height, blue, purple, pink, intensity, speed],
  );

  return (
    <View style={[StyleSheet.absoluteFill, { pointerEvents: "none" }]}>
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
    </View>
  );
}
