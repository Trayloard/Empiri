import React, { useEffect } from "react";
import { Image, StyleSheet, View } from "react-native";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  withSequence,
  withSpring,
  cancelAnimation,
} from "react-native-reanimated";
import { CreatureState } from "@/context/CompanionContext";

const RICK_SPRITE = require("../assets/images/rick_sprite.png");

type Props = {
  state: CreatureState;
  size?: number;
};

const STATE_COLORS: Record<CreatureState, string> = {
  idle: "#00D9FF",
  listening: "#FF8C42",
  thinking: "#7B2FBE",
  responding: "#00E676",
  happy: "#FFD700",
  sleepy: "#4A90D9",
  sad: "#64748B",
};

export function Creature({ state, size = 60 }: Props) {
  const scale = useSharedValue(1);
  const bobY = useSharedValue(0);
  const rotate = useSharedValue(0);
  const glowOpacity = useSharedValue(0.6);

  const color = STATE_COLORS[state];

  useEffect(() => {
    cancelAnimation(scale);
    cancelAnimation(bobY);
    cancelAnimation(rotate);
    cancelAnimation(glowOpacity);

    rotate.value = withTiming(0, { duration: 200 });
    bobY.value = withTiming(0, { duration: 200 });

    if (state === "idle") {
      scale.value = withRepeat(
        withSequence(
          withTiming(1.03, { duration: 2000 }),
          withTiming(0.985, { duration: 2000 })
        ),
        -1,
        true
      );
      bobY.value = withRepeat(
        withSequence(
          withTiming(-2, { duration: 2000 }),
          withTiming(2, { duration: 2000 })
        ),
        -1,
        true
      );
      glowOpacity.value = withRepeat(
        withSequence(
          withTiming(0.7, { duration: 2000 }),
          withTiming(0.35, { duration: 2000 })
        ),
        -1,
        true
      );
    } else if (state === "sleepy") {
      scale.value = withRepeat(
        withSequence(
          withTiming(1.02, { duration: 2600 }),
          withTiming(0.99, { duration: 2600 })
        ),
        -1,
        true
      );
      rotate.value = withTiming(6, { duration: 800 });
      bobY.value = withRepeat(
        withSequence(
          withTiming(-1, { duration: 2600 }),
          withTiming(3, { duration: 2600 })
        ),
        -1,
        true
      );
      glowOpacity.value = withRepeat(
        withSequence(
          withTiming(0.4, { duration: 2600 }),
          withTiming(0.18, { duration: 2600 })
        ),
        -1,
        true
      );
    } else if (state === "listening") {
      bobY.value = withRepeat(
        withSequence(
          withTiming(-3, { duration: 350 }),
          withTiming(3, { duration: 350 })
        ),
        -1,
        true
      );
      scale.value = withSpring(1.05, { damping: 10 });
      glowOpacity.value = withRepeat(
        withSequence(
          withTiming(0.95, { duration: 300 }),
          withTiming(0.5, { duration: 300 })
        ),
        -1,
        true
      );
    } else if (state === "thinking") {
      rotate.value = withRepeat(
        withSequence(
          withTiming(-4, { duration: 700 }),
          withTiming(4, { duration: 700 })
        ),
        -1,
        true
      );
      scale.value = withRepeat(
        withSequence(
          withTiming(1.04, { duration: 700 }),
          withTiming(0.99, { duration: 700 })
        ),
        -1,
        true
      );
      glowOpacity.value = withRepeat(
        withSequence(
          withTiming(0.95, { duration: 600 }),
          withTiming(0.3, { duration: 600 })
        ),
        -1,
        true
      );
    } else if (state === "responding") {
      bobY.value = withRepeat(
        withSequence(
          withTiming(-3, { duration: 220 }),
          withTiming(1, { duration: 220 })
        ),
        -1,
        true
      );
      scale.value = withSpring(1.04, { damping: 8 });
      glowOpacity.value = withRepeat(
        withSequence(
          withTiming(0.95, { duration: 320 }),
          withTiming(0.6, { duration: 320 })
        ),
        -1,
        true
      );
    } else if (state === "happy") {
      scale.value = withSequence(
        withSpring(1.18, { damping: 6, stiffness: 220 }),
        withSpring(1.0, { damping: 11 })
      );
      bobY.value = withSequence(
        withTiming(-10, { duration: 220 }),
        withSpring(0, { damping: 7 })
      );
      rotate.value = withSequence(
        withTiming(-6, { duration: 120 }),
        withTiming(6, { duration: 200 }),
        withSpring(0, { damping: 8 })
      );
      glowOpacity.value = withSequence(
        withTiming(1.0, { duration: 200 }),
        withTiming(0.7, { duration: 900 })
      );
    } else if (state === "sad") {
      scale.value = withTiming(0.96, { duration: 600 });
      bobY.value = withTiming(4, { duration: 600 });
      rotate.value = withTiming(-4, { duration: 600 });
      glowOpacity.value = withRepeat(
        withSequence(
          withTiming(0.3, { duration: 1600 }),
          withTiming(0.14, { duration: 1600 })
        ),
        -1,
        true
      );
    }

    return () => {
      cancelAnimation(scale);
      cancelAnimation(bobY);
      cancelAnimation(rotate);
      cancelAnimation(glowOpacity);
    };
  }, [state]);

  const spriteStyle = useAnimatedStyle(() => ({
    transform: [
      { scale: scale.value },
      { translateY: bobY.value },
      { rotate: `${rotate.value}deg` },
    ],
  }));

  const glowStyle = useAnimatedStyle(() => ({
    opacity: glowOpacity.value,
  }));

  const s = size;

  return (
    <View style={{ width: s, height: s, alignItems: "center", justifyContent: "center" }}>
      <Animated.View style={[StyleSheet.absoluteFill, glowStyle, { alignItems: "center", justifyContent: "center" }]}>
        <View
          style={{
            width: s * 0.95,
            height: s * 0.95,
            borderRadius: s * 0.5,
            backgroundColor: color,
            opacity: 0.22,
          }}
        />
      </Animated.View>

      <Animated.View style={spriteStyle}>
        <Image
          source={RICK_SPRITE}
          style={{ width: s, height: s }}
          resizeMode="contain"
        />
      </Animated.View>
    </View>
  );
}
