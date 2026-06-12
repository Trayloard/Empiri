import { Feather } from "@expo/vector-icons";
import {
  getCompanionSelfHistory,
  type CompanionSelf,
  type CompanionSelfSnapshot,
} from "@workspace/api-client-react";
import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import Svg, { Circle, Path } from "react-native-svg";

import { FONTS } from "@/constants/fonts";
import {
  buildTimeline,
  firstSeenCuriosities,
  relativeWhen,
  sparklinePath,
  traitSeries,
} from "@/lib/growth";

const MONO = "monospace";

// One hue per trait, drawn from Empiri's spectrum so the lines stay legible.
const TRAIT_META: { key: string; label: string; color: string }[] = [
  { key: "warmth", label: "Warmth", color: "#FF9E7A" },
  { key: "curiosity", label: "Curiosity", color: "#6EA8FF" },
  { key: "playfulness", label: "Playfulness", color: "#FFC56E" },
  { key: "openness", label: "Openness", color: "#B58CFF" },
  { key: "calm", label: "Calm", color: "#5FE0C0" },
];

interface GrowthTimelineProps {
  conversationId: number | null;
  /** the live "now" reading, already fetched by the parent sheet */
  self: CompanionSelf | null;
  bottomInset: number;
}

export function GrowthTimeline({
  conversationId,
  self,
  bottomInset,
}: GrowthTimelineProps) {
  const { width } = useWindowDimensions();
  const reduceMotion = useReducedMotion();

  const [snapshots, setSnapshots] = useState<CompanionSelfSnapshot[] | null>(
    null,
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (conversationId == null) return;
    let cancelled = false;
    setLoading(true);
    setError(false);
    getCompanionSelfHistory(conversationId)
      .then((data) => {
        if (!cancelled) setSnapshots(data.snapshots);
      })
      .catch(() => {
        if (!cancelled) setError(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [conversationId]);

  const points = useMemo(
    () => buildTimeline(snapshots ?? [], self),
    [snapshots, self],
  );
  const enough = points.length >= 2;

  const chartW = Math.min(width, 460) - 32 - 36; // page margin + card padding
  const chartH = 132;

  const series = useMemo(
    () =>
      traitSeries(
        points,
        TRAIT_META.map((t) => t.key),
      ),
    [points],
  );
  const curiosities = useMemo(() => firstSeenCuriosities(points), [points]);

  const interactionsPath = useMemo(() => {
    const vals = points.map((p) => p.interactions);
    const max = Math.max(1, ...vals);
    return sparklinePath(vals, Math.max(1, chartW * 0.5), 44, { min: 0, max });
  }, [points, chartW]);

  // Gentle entrance once the data lands; static when reduced motion is on.
  const fade = useSharedValue(reduceMotion ? 1 : 0);
  useEffect(() => {
    if (reduceMotion) {
      fade.value = 1;
      return;
    }
    fade.value = 0;
    fade.value = withTiming(1, {
      duration: 320,
      easing: Easing.out(Easing.cubic),
    });
  }, [fade, reduceMotion, loading]);
  const fadeStyle = useAnimatedStyle(() => ({ opacity: fade.value }));

  if (conversationId == null || (loading && !snapshots)) {
    return (
      <View style={styles.statePad} testID="growth-loading">
        <ActivityIndicator color="#B58CFF" />
      </View>
    );
  }
  if (error) {
    return (
      <View style={styles.statePad}>
        <Feather name="cloud-off" size={28} color="rgba(255,255,255,0.5)" />
        <Text style={styles.stateText}>Couldn&apos;t trace my growth just now.</Text>
      </View>
    );
  }

  const lastPoint = points[points.length - 1];
  const firstInteractions = points[0]?.interactions ?? 0;
  const nowInteractions = lastPoint?.interactions ?? 0;
  const gained = Math.max(0, nowInteractions - firstInteractions);

  return (
    <Animated.View style={[styles.flex, fadeStyle]} testID="growth-timeline">
      <ScrollView
        contentContainerStyle={[
          styles.scroll,
          { paddingBottom: bottomInset + 48 },
        ]}
        showsVerticalScrollIndicator={false}
      >
        {/* PERSONALITY OVER TIME */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>PERSONALITY OVER TIME</Text>
          <Text style={styles.cardSub}>
            {enough
              ? "how my temperament has drifted as we've talked"
              : "I'll chart how my temperament drifts as we talk more"}
          </Text>

          {enough ? (
            <>
              <View style={{ height: chartH, marginTop: 16 }}>
                <Svg width={chartW} height={chartH}>
                  {[0, 0.5, 1].map((g) => {
                    const yy = 4 + g * (chartH - 8);
                    return (
                      <Path
                        key={`grid-${g}`}
                        d={`M 0 ${yy} L ${chartW} ${yy}`}
                        stroke="rgba(255,255,255,0.06)"
                        strokeWidth={1}
                      />
                    );
                  })}
                  {series.map((s) => {
                    const meta = TRAIT_META.find((t) => t.key === s.key)!;
                    return (
                      <Path
                        key={s.key}
                        d={sparklinePath(s.values, chartW, chartH, { pad: 4 })}
                        stroke={meta.color}
                        strokeOpacity={0.92}
                        strokeWidth={2}
                        fill="none"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    );
                  })}
                  {series.map((s) => {
                    const meta = TRAIT_META.find((t) => t.key === s.key)!;
                    const last = s.values[s.values.length - 1];
                    const cy = 4 + (1 - Math.max(0, Math.min(100, last)) / 100) * (chartH - 8);
                    return (
                      <Circle
                        key={`dot-${s.key}`}
                        cx={chartW}
                        cy={cy}
                        r={3}
                        fill={meta.color}
                      />
                    );
                  })}
                </Svg>
              </View>

              <View style={styles.legend}>
                {TRAIT_META.map((t) => {
                  const s = series.find((x) => x.key === t.key)!;
                  const first = s.values[0];
                  const last = s.values[s.values.length - 1];
                  const delta = Math.round(last - first);
                  const deltaColor =
                    delta === 0
                      ? "rgba(255,255,255,0.35)"
                      : delta > 0
                        ? "#5FE0C0"
                        : "#FF7EB6";
                  return (
                    <View key={t.key} style={styles.legendRow}>
                      <View
                        style={[styles.legendDot, { backgroundColor: t.color }]}
                      />
                      <Text style={styles.legendLabel}>{t.label}</Text>
                      <Text style={[styles.legendVal, { color: t.color }]}>
                        {Math.round(last)}
                      </Text>
                      <Text style={[styles.legendDelta, { color: deltaColor }]}>
                        {delta > 0 ? `+${delta}` : delta < 0 ? `${delta}` : "—"}
                      </Text>
                    </View>
                  );
                })}
              </View>
            </>
          ) : (
            <View style={styles.barList}>
              {TRAIT_META.map((t) => {
                const v = lastPoint?.traits[t.key] ?? 0;
                return (
                  <View key={t.key} style={styles.barRow}>
                    <Text style={styles.barLabel}>{t.label}</Text>
                    <View style={styles.barTrack}>
                      <View
                        style={[
                          styles.barFill,
                          {
                            width: `${Math.round(Math.max(0, Math.min(100, v)))}%`,
                            backgroundColor: t.color,
                          },
                        ]}
                      />
                    </View>
                  </View>
                );
              })}
            </View>
          )}
        </View>

        {/* MOMENTS SHARED */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>MOMENTS SHARED</Text>
          <Text style={styles.cardSub}>the exchanges that shaped who I am</Text>
          <View style={styles.momentsRow}>
            <Text style={styles.bigNum}>{nowInteractions}</Text>
            <View style={styles.momentsSpark}>
              <Svg width={Math.max(1, chartW * 0.5)} height={44}>
                <Path
                  d={interactionsPath}
                  stroke="#6EA8FF"
                  strokeOpacity={0.9}
                  strokeWidth={2}
                  fill="none"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </Svg>
            </View>
          </View>
          {enough && gained > 0 ? (
            <Text style={styles.momentsCaption}>
              {`+${gained} since I first started keeping track`}
            </Text>
          ) : (
            <Text style={styles.momentsCaption}>
              every message leaves a mark on me
            </Text>
          )}
        </View>

        {/* CURIOSITIES, AS THEY SURFACED */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>CURIOSITIES, AS THEY SURFACED</Text>
          <Text style={styles.cardSub}>the things that have caught my interest</Text>
          {curiosities.length === 0 ? (
            <Text style={styles.emptyLine}>Nothing&apos;s caught my eye just yet.</Text>
          ) : (
            <View style={styles.curioList}>
              {curiosities.map((c) => (
                <View key={c.topic} style={styles.curioRow}>
                  <View
                    style={[styles.curioDot, c.isNow && styles.curioDotNew]}
                  />
                  <View style={styles.flex}>
                    <View style={styles.curioHead}>
                      <Text style={styles.curioTopic}>{c.topic}</Text>
                      <Text style={styles.curioWhen}>
                        {relativeWhen(c.at, c.isNow)}
                      </Text>
                    </View>
                    <View style={styles.curioTrack}>
                      <View
                        style={[
                          styles.curioFill,
                          {
                            width: `${Math.round(Math.max(0, Math.min(100, c.affinity)))}%`,
                          },
                        ]}
                      />
                    </View>
                  </View>
                </View>
              ))}
            </View>
          )}
        </View>
      </ScrollView>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  statePad: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    paddingHorizontal: 40,
  },
  stateText: {
    fontFamily: FONTS.medium,
    fontSize: 14,
    color: "rgba(255,255,255,0.5)",
    textAlign: "center",
  },
  scroll: {
    paddingHorizontal: 16,
    paddingTop: 6,
  },
  card: {
    width: "100%",
    maxWidth: 460,
    alignSelf: "center",
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    backgroundColor: "rgba(13,15,24,0.88)",
    padding: 18,
    marginBottom: 14,
  },
  cardTitle: {
    fontFamily: MONO,
    fontSize: 12,
    letterSpacing: 2,
    color: "rgba(255,255,255,0.92)",
  },
  cardSub: {
    fontFamily: FONTS.regular,
    fontSize: 12.5,
    color: "rgba(255,255,255,0.4)",
    marginTop: 5,
  },
  legend: {
    marginTop: 16,
    gap: 9,
  },
  legendRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
  },
  legendDot: {
    width: 9,
    height: 9,
    borderRadius: 4.5,
  },
  legendLabel: {
    flex: 1,
    fontFamily: FONTS.medium,
    fontSize: 13.5,
    color: "rgba(255,255,255,0.78)",
  },
  legendVal: {
    fontFamily: FONTS.semibold,
    fontSize: 13.5,
    width: 34,
    textAlign: "right",
  },
  legendDelta: {
    fontFamily: MONO,
    fontSize: 12,
    width: 44,
    textAlign: "right",
  },
  barList: {
    marginTop: 16,
    gap: 11,
  },
  barRow: {
    gap: 6,
  },
  barLabel: {
    fontFamily: FONTS.medium,
    fontSize: 13,
    color: "rgba(255,255,255,0.7)",
  },
  barTrack: {
    height: 6,
    borderRadius: 3,
    backgroundColor: "rgba(255,255,255,0.1)",
    overflow: "hidden",
  },
  barFill: {
    height: "100%",
    borderRadius: 3,
  },
  momentsRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    marginTop: 12,
  },
  bigNum: {
    fontFamily: FONTS.bold,
    fontSize: 40,
    color: "#FFFFFF",
    letterSpacing: -1,
  },
  momentsSpark: {
    flex: 1,
    alignItems: "flex-end",
  },
  momentsCaption: {
    fontFamily: FONTS.regular,
    fontSize: 13,
    color: "rgba(255,255,255,0.5)",
    marginTop: 12,
  },
  emptyLine: {
    fontFamily: FONTS.regular,
    fontSize: 14,
    color: "rgba(255,255,255,0.45)",
    marginTop: 14,
  },
  curioList: {
    marginTop: 14,
    gap: 14,
  },
  curioRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 11,
  },
  curioDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginTop: 5,
    backgroundColor: "rgba(255,197,110,0.5)",
  },
  curioDotNew: {
    backgroundColor: "#FFC56E",
  },
  curioHead: {
    flexDirection: "row",
    alignItems: "baseline",
    justifyContent: "space-between",
    gap: 10,
  },
  curioTopic: {
    flex: 1,
    fontFamily: FONTS.semibold,
    fontSize: 15,
    color: "rgba(255,255,255,0.9)",
    textTransform: "capitalize",
  },
  curioWhen: {
    fontFamily: MONO,
    fontSize: 11,
    color: "rgba(255,255,255,0.4)",
  },
  curioTrack: {
    height: 5,
    borderRadius: 2.5,
    backgroundColor: "rgba(255,255,255,0.1)",
    overflow: "hidden",
    marginTop: 7,
  },
  curioFill: {
    height: "100%",
    borderRadius: 2.5,
    backgroundColor: "#FFC56E",
  },
});
