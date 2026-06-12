import React, { useEffect, useState } from "react";
import { StyleSheet } from "react-native";
import Animated, {
  Easing,
  runOnJS,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withSequence,
  withTiming,
} from "react-native-reanimated";

import { FONTS } from "@/constants/fonts";

interface PresenceStatusLineProps {
  /** Short welcome line shown on first wake-up. */
  greeting: string;
  /** The live status/mood line the presence settles into. */
  statusText: string;
  color: string;
}

const ENTER_DELAY = 480;
const HOLD = 2600;

/**
 * The single line beneath the presence. On a cold start it gently blooms in
 * with a short greeting, holds for a beat, then crossfades into the live
 * status/mood line. Reduce-motion swaps instantly with no animation.
 */
export function PresenceStatusLine({
  greeting,
  statusText,
  color,
}: PresenceStatusLineProps) {
  const reduceMotion = useReducedMotion();
  const [welcomeDone, setWelcomeDone] = useState(false);
  const op = useSharedValue(reduceMotion ? 1 : 0);
  const ty = useSharedValue(reduceMotion ? 0 : 6);

  // Subtle entrance for the line.
  useEffect(() => {
    if (reduceMotion) return;
    op.value = withDelay(
      ENTER_DELAY,
      withTiming(1, { duration: 650, easing: Easing.out(Easing.cubic) }),
    );
    ty.value = withDelay(
      ENTER_DELAY,
      withTiming(0, { duration: 650, easing: Easing.out(Easing.cubic) }),
    );
  }, [op, ty, reduceMotion]);

  // Hold the greeting, then settle into the live status line.
  useEffect(() => {
    const t = setTimeout(() => {
      if (reduceMotion) {
        setWelcomeDone(true);
        return;
      }
      op.value = withSequence(
        withTiming(
          0,
          { duration: 320, easing: Easing.in(Easing.cubic) },
          (finished) => {
            if (finished) runOnJS(setWelcomeDone)(true);
          },
        ),
        withTiming(1, { duration: 460, easing: Easing.out(Easing.cubic) }),
      );
    }, HOLD);
    return () => clearTimeout(t);
  }, [op, reduceMotion]);

  const style = useAnimatedStyle(() => ({
    opacity: op.value,
    transform: [{ translateY: ty.value }],
  }));

  return (
    <Animated.Text style={[styles.status, { color }, style]}>
      {welcomeDone ? statusText : greeting}
    </Animated.Text>
  );
}

const styles = StyleSheet.create({
  status: {
    fontSize: 14,
    fontFamily: FONTS.medium,
    marginTop: 3,
  },
});
