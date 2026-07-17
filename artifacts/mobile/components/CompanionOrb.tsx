import React, { useMemo } from "react";
import type { StyleProp, ViewStyle } from "react-native";
import { StyleSheet, View } from "react-native";
import { useDerivedValue, useReducedMotion } from "react-native-reanimated";

import { GlowBlob } from "@/components/GlowBlob";
import { useColors } from "@/hooks/useColors";
import {
  useSmoothedTraitInfluence,
  type SmoothedTraitInfluence,
} from "@/hooks/useSmoothedTraitInfluence";
import type { CompanionStatus } from "@/contexts/CompanionContext";
import type { MoodLabel } from "@/lib/mood";
import { orbBlobOpacity, type OrbBlobKind } from "@/lib/orbOpacity";
import {
  NEUTRAL_INFLUENCE,
  type TraitInfluence,
} from "@/lib/traitInfluence";

interface CompanionOrbProps {
  status: CompanionStatus;
  mood?: MoodLabel;
  size?: number;
  /** Personality-derived influence — layered on top of mood/activity dynamics. */
  traits?: TraitInfluence;
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
  // Sad: dimmer and more still than sleepy — a quiet, withdrawn presence.
  sad: { speed: 0.38, intensity: 0.48, drift: 0.42, coreBoost: 0.55 },
};

// Active states are unmistakable — the presence quickens and brightens.
const ACTIVE_DYNAMICS: Partial<Record<CompanionStatus, Dynamics>> = {
  thinking: { speed: 1.9, intensity: 1.0, drift: 1.4, coreBoost: 1.15 },
  transcribing: { speed: 1.9, intensity: 1.0, drift: 1.4, coreBoost: 1.15 },
  listening: { speed: 2.5, intensity: 1.18, drift: 1.9, coreBoost: 1.3 },
  speaking: { speed: 3.0, intensity: 1.12, drift: 1.7, coreBoost: 1.25 },
};

const BASE_DURATION = 4200;

interface OrbBlobConfig {
  id: string;
  kind: OrbBlobKind;
  color: string;
  size: number;
  offX: number;
  offY: number;
  durMult: number;
  delay: number;
  drift: number;
  scaleTo: number;
  innerStop: number;
}

interface OrbBlobProps {
  kind: OrbBlobKind;
  /** Snappy brightness from mood/activity (no trait influence). */
  baseIntensity: number;
  /** Snappy core brightness from mood/activity (core blob only). */
  baseCoreBoost: number;
  /** Eased trait influence — read on the UI thread. */
  traits: SmoothedTraitInfluence;
  id: string;
  color: string;
  size: number;
  duration: number;
  delay?: number;
  drift: number;
  scaleTo: number;
  innerStop: number;
  reduceMotion: boolean;
  style?: StyleProp<ViewStyle>;
}

/**
 * One orb blob. The status/mood brightness (`baseIntensity` / `baseCoreBoost`)
 * stays snappy in JS, while the personality contribution is read from eased
 * shared values inside a worklet — so a trait shift cross-fades but a state
 * change (listening / thinking) still lands instantly.
 *
 * Reproduces the original per-blob opacity formulas exactly, except the orb's
 * `warm` boolean threshold is replaced with a narrow smoothstep ramp so the
 * pink/orange warm tones don't pop as the threshold is crossed mid-fade.
 */
function OrbBlob({
  kind,
  baseIntensity,
  baseCoreBoost,
  traits,
  ...glow
}: OrbBlobProps) {
  const opacity = useDerivedValue(() =>
    orbBlobOpacity(
      kind,
      baseIntensity,
      baseCoreBoost,
      traits.glowBoost.value,
      traits.warmthShift.value,
    ),
  );

  return <GlowBlob opacity={opacity} {...glow} />;
}

export function CompanionOrb({
  status,
  mood = "content",
  size = 120,
  traits = NEUTRAL_INFLUENCE,
}: CompanionOrbProps) {
  const colors = useColors();
  const reduceMotion = useReducedMotion();
  const smoothed = useSmoothedTraitInfluence(traits);

  const baseDyn = ACTIVE_DYNAMICS[status] ?? MOOD_DYNAMICS[mood];

  // Breathing cadence + drift carry a small liveliness boost. These feed the
  // GlowBlob animation loop (rebuilt on change), so they stay derived from the
  // settled target trait — a ≤17% cadence retarget on the rare refresh is
  // invisible, and easing them would restart the loop every frame. The visible
  // jump (brightness + warm/cool balance) is eased via the trait shared values.
  const speed = baseDyn.speed * (1 + traits.livelinessBoost * 0.6);
  const driftMult = baseDyn.drift * (1 + traits.livelinessBoost * 0.5);

  const dur = (mult: number) => Math.round((BASE_DURATION / speed) * mult);
  const [blue, purple, pink, orange] = colors.spectrum;

  const wrap = size * 1.85;

  // Stable-ish layout offsets so blobs overlap and mix into one presence.
  const blobs = useMemo<OrbBlobConfig[]>(
    () => [
      {
        id: "orb-halo",
        kind: "halo",
        color: purple,
        size: size * 1.6,
        offX: 0,
        offY: 0,
        durMult: 1.5,
        delay: 0,
        drift: 10,
        scaleTo: 1.12,
        innerStop: 40,
      },
      {
        id: "orb-blue",
        kind: "blue",
        color: blue,
        size: size * 1.05,
        offX: -size * 0.22,
        offY: -size * 0.16,
        durMult: 1.0,
        delay: 0,
        drift: 16,
        scaleTo: 1.16,
        innerStop: 55,
      },
      {
        id: "orb-purple",
        kind: "purple",
        color: purple,
        size: size * 1.05,
        offX: size * 0.2,
        offY: -size * 0.1,
        durMult: 0.85,
        delay: 300,
        drift: 18,
        scaleTo: 1.2,
        innerStop: 55,
      },
      {
        id: "orb-pink",
        kind: "pink",
        color: pink,
        size: size,
        offX: size * 0.16,
        offY: size * 0.2,
        durMult: 0.95,
        delay: 600,
        drift: 17,
        scaleTo: 1.18,
        innerStop: 55,
      },
      {
        id: "orb-orange",
        kind: "orange",
        color: orange,
        size: size * 0.9,
        offX: -size * 0.18,
        offY: size * 0.18,
        durMult: 1.1,
        delay: 900,
        drift: 15,
        scaleTo: 1.16,
        innerStop: 55,
      },
    ],
    [size, blue, purple, pink, orange],
  );

  return (
    <View style={[styles.wrap, { width: wrap, height: wrap }]}>
      {blobs.map((b) => (
        <OrbBlob
          key={b.id}
          kind={b.kind}
          baseIntensity={baseDyn.intensity}
          baseCoreBoost={baseDyn.coreBoost}
          traits={smoothed}
          id={b.id}
          color={b.color}
          size={b.size}
          duration={dur(b.durMult)}
          delay={b.delay}
          drift={b.drift * driftMult}
          scaleTo={b.scaleTo}
          innerStop={b.innerStop}
          reduceMotion={reduceMotion}
          style={{
            left: wrap / 2 - b.size / 2 + b.offX,
            top: wrap / 2 - b.size / 2 + b.offY,
          }}
        />
      ))}

      {/* Bright living core */}
      <OrbBlob
        kind="core"
        baseIntensity={baseDyn.intensity}
        baseCoreBoost={baseDyn.coreBoost}
        traits={smoothed}
        id="orb-core"
        color={colors.presenceCore}
        size={size * 0.62}
        duration={dur(0.7)}
        drift={6 * driftMult}
        scaleTo={1.14}
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
