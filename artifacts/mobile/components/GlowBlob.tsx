import React, { useEffect } from "react";
import type { StyleProp, ViewStyle } from "react-native";
import Animated, {
  Easing,
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
  type SharedValue,
} from "react-native-reanimated";
import Svg, { Circle, Defs, RadialGradient, Stop } from "react-native-svg";

interface GlowBlobProps {
  /** Unique id for the SVG radial gradient (must be unique on screen). */
  id: string;
  color: string;
  size: number;
  /** Base breathing duration in ms. Smaller = faster/more energetic. */
  duration?: number;
  /** How far the blob drifts as it morphs, in px. */
  drift?: number;
  /** Peak breathing scale. */
  scaleTo?: number;
  /** Phase offset in ms so stacked blobs feel fluid, not synchronized. */
  delay?: number;
  /**
   * Overall opacity of the blob. A plain number renders statically; a shared
   * value lets a personality shift cross-fade the brightness on the UI thread.
   */
  opacity?: number | SharedValue<number>;
  /** Inner gradient stop (%) — higher = tighter, brighter core. */
  innerStop?: number;
  /** When true, holds a calm static frame instead of animating. */
  reduceMotion?: boolean;
  style?: StyleProp<ViewStyle>;
}

/**
 * A soft, blurred circle of light built from an SVG radial gradient (color in
 * the center fading to transparent at the edge). It breathes and drifts
 * continuously; several stacked at different colors/phases read as one fluid,
 * iridescent presence. Drift + scale run entirely on the UI thread.
 */
export function GlowBlob({
  id,
  color,
  size,
  duration = 4200,
  drift = 14,
  scaleTo = 1.18,
  delay = 0,
  opacity = 0.85,
  innerStop = 55,
  reduceMotion = false,
  style,
}: GlowBlobProps) {
  const scale = useSharedValue(1);
  const tx = useSharedValue(0);
  const ty = useSharedValue(0);

  useEffect(() => {
    cancelAnimation(scale);
    cancelAnimation(tx);
    cancelAnimation(ty);

    if (reduceMotion) {
      scale.value = withTiming((1 + scaleTo) / 2, { duration: 600 });
      tx.value = withTiming(0, { duration: 600 });
      ty.value = withTiming(0, { duration: 600 });
      return;
    }

    scale.value = withDelay(
      delay,
      withRepeat(
        withSequence(
          withTiming(scaleTo, {
            duration,
            easing: Easing.inOut(Easing.ease),
          }),
          withTiming(1, { duration, easing: Easing.inOut(Easing.ease) }),
        ),
        -1,
        false,
      ),
    );

    tx.value = -drift;
    tx.value = withDelay(
      delay,
      withRepeat(
        withTiming(drift, {
          duration: duration * 1.35,
          easing: Easing.inOut(Easing.ease),
        }),
        -1,
        true,
      ),
    );

    ty.value = drift;
    ty.value = withDelay(
      delay,
      withRepeat(
        withTiming(-drift, {
          duration: duration * 1.7,
          easing: Easing.inOut(Easing.ease),
        }),
        -1,
        true,
      ),
    );

    return () => {
      cancelAnimation(scale);
      cancelAnimation(tx);
      cancelAnimation(ty);
    };
  }, [reduceMotion, duration, drift, scaleTo, delay, scale, tx, ty]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: typeof opacity === "number" ? opacity : opacity.value,
    transform: [
      { translateX: tx.value },
      { translateY: ty.value },
      { scale: scale.value },
    ],
  }));

  return (
    <Animated.View
      style={[
        {
          position: "absolute",
          width: size,
          height: size,
          pointerEvents: "none",
        },
        animatedStyle,
        style,
      ]}
    >
      <Svg width={size} height={size}>
        <Defs>
          <RadialGradient id={id} cx="50%" cy="50%" r="50%">
            <Stop offset="0%" stopColor={color} stopOpacity={1} />
            <Stop offset={`${innerStop}%`} stopColor={color} stopOpacity={0.4} />
            <Stop offset="100%" stopColor={color} stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Circle cx={size / 2} cy={size / 2} r={size / 2} fill={`url(#${id})`} />
      </Svg>
    </Animated.View>
  );
}
