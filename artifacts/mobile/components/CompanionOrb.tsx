import React, { useMemo } from "react";
import { StyleSheet, View } from "react-native";
import { useReducedMotion } from "react-native-reanimated";

import { GlowBlob } from "@/components/GlowBlob";
import { useColors } from "@/hooks/useColors";
import type { CompanionStatus } from "@/contexts/CompanionContext";
import type { MoodLabel } from "@/lib/mood";

interface CompanionOrbProps {
  status: CompanionStatus;
  mood?: MoodLabel;
  size?: number;
}

interface Dynamics {
  /** Pace multiplier — higher is faster/more energetic. */
  speed: number;
  /** Brightness/presence multiplier. */
  intensity: number;
  /** Drift multiplier — how widely the light morphs. */
  drift: number;
  /** Extra brightness for the white core. */
  coreBoost: number;
}

// At rest the mood sets how alive and warm the presence feels.
const MOOD_DYNAMICS: Record<MoodLabel, Dynamics> = {
  bright: { speed: 1.25, intensity: 1.0, drift: 1.0, coreBoost: 1.0 },
  happy: { speed: 1.1, intensity: 0.95, drift: 0.95, coreBoost: 0.95 },
  content: { speed: 0.9, intensity: 0.88, drift: 0.85, coreBoost: 0.9 },
  low: { speed: 0.65, intensity: 0.72, drift: 0.7, coreBoost: 0.78 },
  sleepy: { speed: 0.5, intensity: 0.58, drift: 0.55, coreBoost: 0.66 },
};

// Active states are unmistakable — the presence quickens and brightens.
const ACTIVE_DYNAMICS: Partial<Record<CompanionStatus, Dynamics>> = {
  thinking: { speed: 1.9, intensity: 1.0, drift: 1.4, coreBoost: 1.15 },
  transcribing: { speed: 1.9, intensity: 1.0, drift: 1.4, coreBoost: 1.15 },
  listening: { speed: 2.5, intensity: 1.18, drift: 1.9, coreBoost: 1.3 },
  speaking: { speed: 3.0, intensity: 1.12, drift: 1.7, coreBoost: 1.25 },
};

const BASE_DURATION = 4200;

export function CompanionOrb({
  status,
  mood = "content",
  size = 120,
}: CompanionOrbProps) {
  const colors = useColors();
  const reduceMotion = useReducedMotion();

  const dyn = ACTIVE_DYNAMICS[status] ?? MOOD_DYNAMICS[mood];
  const dur = (mult: number) => Math.round((BASE_DURATION / dyn.speed) * mult);
  const [blue, purple, pink, orange] = colors.spectrum;

  // A faded companion cools toward blue/violet; an awake one glows warm.
  const warm = dyn.intensity >= 0.85;

  const wrap = size * 1.85;

  // Stable-ish layout offsets so blobs overlap and mix into one presence.
  const blobs = useMemo(
    () => [
      {
        id: "orb-halo",
        color: purple,
        size: size * 1.6,
        offX: 0,
        offY: 0,
        durMult: 1.5,
        delay: 0,
        drift: 10,
        scaleTo: 1.12,
        op: 0.45 * dyn.intensity,
        innerStop: 40,
      },
      {
        id: "orb-blue",
        color: blue,
        size: size * 1.05,
        offX: -size * 0.22,
        offY: -size * 0.16,
        durMult: 1.0,
        delay: 0,
        drift: 16,
        scaleTo: 1.16,
        op: 0.9 * dyn.intensity,
        innerStop: 55,
      },
      {
        id: "orb-purple",
        color: purple,
        size: size * 1.05,
        offX: size * 0.2,
        offY: -size * 0.1,
        durMult: 0.85,
        delay: 300,
        drift: 18,
        scaleTo: 1.2,
        op: 0.9 * dyn.intensity,
        innerStop: 55,
      },
      {
        id: "orb-pink",
        color: pink,
        size: size,
        offX: size * 0.16,
        offY: size * 0.2,
        durMult: 0.95,
        delay: 600,
        drift: 17,
        scaleTo: 1.18,
        op: (warm ? 0.85 : 0.5) * dyn.intensity,
        innerStop: 55,
      },
      {
        id: "orb-orange",
        color: orange,
        size: size * 0.9,
        offX: -size * 0.18,
        offY: size * 0.18,
        durMult: 1.1,
        delay: 900,
        drift: 15,
        scaleTo: 1.16,
        op: (warm ? 0.7 : 0.32) * dyn.intensity,
        innerStop: 55,
      },
    ],
    [size, blue, purple, pink, orange, warm, dyn.intensity],
  );

  return (
    <View style={[styles.wrap, { width: wrap, height: wrap }]}>
      {blobs.map((b) => (
        <GlowBlob
          key={b.id}
          id={b.id}
          color={b.color}
          size={b.size}
          duration={dur(b.durMult)}
          delay={b.delay}
          drift={b.drift * dyn.drift}
          scaleTo={b.scaleTo}
          opacity={Math.min(1, b.op)}
          innerStop={b.innerStop}
          reduceMotion={reduceMotion}
          style={{
            left: wrap / 2 - b.size / 2 + b.offX,
            top: wrap / 2 - b.size / 2 + b.offY,
          }}
        />
      ))}

      {/* Bright living core */}
      <GlowBlob
        id="orb-core"
        color={colors.presenceCore}
        size={size * 0.62}
        duration={dur(0.7)}
        drift={6 * dyn.drift}
        scaleTo={1.14}
        opacity={Math.min(1, 0.85 * dyn.coreBoost)}
        innerStop={45}
        reduceMotion={reduceMotion}
        style={{
          left: wrap / 2 - (size * 0.62) / 2,
          top: wrap / 2 - (size * 0.62) / 2,
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: "center",
    justifyContent: "center",
  },
});
