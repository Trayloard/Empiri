import { Feather } from "@expo/vector-icons";
import {
  getCompanionSelfHistory,
  type CompanionSelf,
  type CompanionSelfSnapshot,
} from "@workspace/api-client-react";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import Animated, {
  Easing,
  runOnJS,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Svg, { Circle, Line, Path } from "react-native-svg";

import { FONTS } from "@/constants/fonts";
import { accentForWarmth } from "@/lib/accent";
import {
  buildTimeline,
  chapterPeriodLabel,
  firstSeenCuriosities,
  nearestTimelineIndex,
  relativeWhen,
  sparklinePath,
  timeAxisTicks,
  timePositions,
  traitSeries,
} from "@/lib/growth";

const MONO = "monospace";

function hexA(hex: string, a: number): string {
  const h = hex.replace("#", "");
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${a})`;
}

// One hue per trait, drawn from Empiri's spectrum so the lines stay legible.
const TRAIT_META: { key: string; label: string; color: string }[] = [
  { key: "warmth", label: "Warmth", color: "#FF9E7A" },
  { key: "curiosity", label: "Curiosity", color: "#6EA8FF" },
  { key: "playfulness", label: "Playfulness", color: "#FFC56E" },
  { key: "openness", label: "Openness", color: "#B58CFF" },
  { key: "calm", label: "Calm", color: "#5FE0C0" },
];

// The timeline's own neutral accents, and the fixed dark-sheet spectrum they
// tint along (the sheet ignores the app color scheme).
const SPINNER_ACCENT = "#B58CFF";
const CURIO_ACCENT = "#FFC56E";
const SHEET_SPECTRUM = ["#5B8CFF", "#A855F7", "#EC4899", "#FB923C"] as const;

interface GrowthTimelineProps {
  conversationId: number | null;
  /** the live "now" reading, already fetched by the parent sheet */
  self: CompanionSelf | null;
  bottomInset: number;
  /**
   * Smoothed personality warmth (see `useSmoothedWarmth`). Gently tints the
   * timeline's accents; `0` (or omitted) keeps today's exact colors.
   */
  warmth?: number;
}

export function GrowthTimeline({
  conversationId,
  self,
  bottomInset,
  warmth = 0,
}: GrowthTimelineProps) {
  const { width } = useWindowDimensions();
  const reduceMotion = useReducedMotion();

  // Centre-anchored personality tints — neutral warmth keeps today's colors.
  const spinnerAccent = accentForWarmth(warmth, SPINNER_ACCENT, SHEET_SPECTRUM);
  const curioAccent = accentForWarmth(warmth, CURIO_ACCENT, SHEET_SPECTRUM);

  const [snapshots, setSnapshots] = useState<CompanionSelfSnapshot[] | null>(
    null,
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  // Bumping this re-runs the history fetch — the in-place "Try again" path.
  const [attempt, setAttempt] = useState(0);

  // Scrubber state — which point is the user currently touching?
  // null means no active touch (readout hidden).
  const [activeIdx, setActiveIdx] = useState<number | null>(null);

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
  }, [conversationId, attempt]);

  const points = useMemo(
    () => buildTimeline(snapshots ?? [], self),
    [snapshots, self],
  );
  const enough = points.length >= 2;

  const chartW = Math.min(width, 460) - 32 - 36; // page margin + card padding
  const chartH = 132;

  // Gesture handler for the personality chart.
  // xs is read on the JS thread via a ref so gesture worklets don't need to
  // touch JS objects directly — they hand off to runOnJS callbacks.
  const xsRef = useRef<number[]>([]);

  // JS-thread callback: compute nearest index and update React state.
  const onScrubTouch = useCallback(
    (touchX: number) => {
      const xNorm = Math.max(0, Math.min(1, touchX / chartW));
      const idx = nearestTimelineIndex(xNorm, xsRef.current);
      setActiveIdx(idx < 0 ? null : idx);
    },
    [chartW],
  );

  const tapDismissRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const onScrubRelease = useCallback(() => {
    setActiveIdx(null);
    if (tapDismissRef.current != null) {
      clearTimeout(tapDismissRef.current);
      tapDismissRef.current = null;
    }
  }, []);

  // On tap: show the readout then auto-dismiss after 1.5 s so the user has
  // time to read the values without having to hold the chart.
  const onTapEnd = useCallback(
    (touchX: number) => {
      onScrubTouch(touchX);
      if (tapDismissRef.current != null) clearTimeout(tapDismissRef.current);
      tapDismissRef.current = setTimeout(() => {
        tapDismissRef.current = null;
        setActiveIdx(null);
      }, 1500);
    },
    [onScrubTouch],
  );

  // Cancel any pending tap-dismiss when a pan starts.
  const onPanBegin = useCallback(
    (touchX: number) => {
      if (tapDismissRef.current != null) {
        clearTimeout(tapDismissRef.current);
        tapDismissRef.current = null;
      }
      onScrubTouch(touchX);
    },
    [onScrubTouch],
  );

  const chartGesture = useMemo(() => {
    const onTouchJS = runOnJS(onScrubTouch);
    const onTapEndJS = runOnJS(onTapEnd);
    const onPanBeginJS = runOnJS(onPanBegin);
    const onReleaseJS = runOnJS(onScrubRelease);
    return Gesture.Race(
      Gesture.Tap().onEnd((e) => {
        onTapEndJS(e.x);
      }),
      Gesture.Pan()
        .minDistance(0)
        .onBegin((e) => onPanBeginJS(e.x))
        .onUpdate((e) => onTouchJS(e.x))
        .onEnd(() => onReleaseJS())
        .onFinalize(() => onReleaseJS()),
    );
  }, [onScrubTouch, onTapEnd, onPanBegin, onScrubRelease]);

  const series = useMemo(
    () =>
      traitSeries(
        points,
        TRAIT_META.map((t) => t.key),
      ),
    [points],
  );
  const curiosities = useMemo(() => firstSeenCuriosities(points), [points]);

  // Real time positions so irregular gaps between snapshots read truthfully,
  // plus light endpoint labels for the span.
  const xs = useMemo(() => timePositions(points), [points]);
  const axisTicks = useMemo(() => timeAxisTicks(points), [points]);

  // Keep the ref that worklet closures read in sync with the latest xs array.
  useEffect(() => {
    xsRef.current = xs;
  }, [xs, xsRef]);

  const interactionsPath = useMemo(() => {
    const vals = points.map((p) => p.interactions);
    const max = Math.max(1, ...vals);
    return sparklinePath(vals, Math.max(1, chartW * 0.5), 44, { min: 0, max, xs });
  }, [points, chartW, xs]);

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
        <ActivityIndicator color={spinnerAccent} />
      </View>
    );
  }
  if (error) {
    return (
      <View style={styles.statePad}>
        <Feather name="cloud-off" size={28} color="rgba(255,255,255,0.5)" />
        <Text style={styles.stateText}>Couldn&apos;t trace my growth just now.</Text>
        <Pressable
          onPress={() => setAttempt((a) => a + 1)}
          accessibilityRole="button"
          accessibilityLabel="Try again"
          testID="retry-growth"
          style={({ pressed }) => [
            styles.retryBtn,
            { borderColor: hexA(spinnerAccent, 0.55) },
            pressed ? { opacity: 0.7 } : null,
          ]}
        >
          <Feather name="refresh-cw" size={13} color={spinnerAccent} />
          <Text style={[styles.retryText, { color: spinnerAccent }]}>
            Try again
          </Text>
        </Pressable>
      </View>
    );
  }

  const lastPoint = points[points.length - 1];
  const firstInteractions = points[0]?.interactions ?? 0;
  const nowInteractions = lastPoint?.interactions ?? 0;
  const gained = Math.max(0, nowInteractions - firstInteractions);
  // Served oldest-first by the API; sort defensively so the story always
  // reads chronologically.
  const chapters = [...(self?.chapters ?? [])].sort((a, b) => a.from - b.from);

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
              {/* Chart — wrapped in a gesture detector for scrubbing */}
              <GestureDetector gesture={chartGesture}>
                <View
                  style={{ height: chartH, marginTop: 16 }}
                  accessibilityLabel="Personality chart — drag to explore past moments"
                  accessibilityHint="Drag left or right to see Empiri's trait values at each recorded moment"
                >
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
                          d={sparklinePath(s.values, chartW, chartH, { pad: 4, xs })}
                          stroke={meta.color}
                          strokeOpacity={0.92}
                          strokeWidth={2}
                          fill="none"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      );
                    })}
                    {/* Scrubber hit dots — one per trait at the active snapshot */}
                    {activeIdx !== null &&
                      series.map((s) => {
                        const meta = TRAIT_META.find((t) => t.key === s.key)!;
                        const val = s.values[activeIdx] ?? 0;
                        const cx = (xs[activeIdx] ?? 0) * chartW;
                        const cy = 4 + (1 - Math.max(0, Math.min(100, val)) / 100) * (chartH - 8);
                        return (
                          <Circle
                            key={`scrub-dot-${s.key}`}
                            cx={cx}
                            cy={cy}
                            r={4}
                            fill={meta.color}
                            stroke="rgba(13,15,24,0.9)"
                            strokeWidth={1.5}
                          />
                        );
                      })}
                    {/* "now" endpoint dots (static) */}
                    {activeIdx === null &&
                      series.map((s) => {
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
                    {/* Scrubber vertical line — drawn last so it sits on top */}
                    {activeIdx !== null && (
                      <Line
                        x1={(xs[activeIdx] ?? 0) * chartW}
                        y1={0}
                        x2={(xs[activeIdx] ?? 0) * chartW}
                        y2={chartH}
                        stroke="rgba(255,255,255,0.3)"
                        strokeWidth={1}
                        strokeDasharray="3 3"
                      />
                    )}
                  </Svg>
                </View>
              </GestureDetector>

              {axisTicks.length > 0 ? (
                <View style={styles.axisRow}>
                  <Text style={styles.axisLabel}>{axisTicks[0].label}</Text>
                  <Text style={styles.axisLabel}>
                    {axisTicks[axisTicks.length - 1].label}
                  </Text>
                </View>
              ) : null}

              {/* Scrubber readout — slides in when the user touches the chart */}
              {activeIdx !== null ? (
                <View style={styles.readout} testID="scrubber-readout">
                  <Text style={styles.readoutDate}>
                    {points[activeIdx].isNow
                      ? "now"
                      : (() => {
                          const d = new Date(points[activeIdx].at);
                          return `${["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"][d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
                        })()}
                  </Text>
                  <View style={styles.readoutTraits}>
                    {TRAIT_META.map((t) => {
                      const val = Math.round(
                        series.find((s) => s.key === t.key)?.values[activeIdx] ?? 0,
                      );
                      return (
                        <View key={t.key} style={styles.readoutTraitRow}>
                          <View style={[styles.readoutDot, { backgroundColor: t.color }]} />
                          <Text style={styles.readoutTraitLabel}>{t.label}</Text>
                          <Text style={[styles.readoutTraitVal, { color: t.color }]}>
                            {val}
                          </Text>
                        </View>
                      );
                    })}
                    {points[activeIdx].interests.length > 0 ? (
                      <View style={styles.readoutCurioRow}>
                        {points[activeIdx].interests.slice(0, 3).map((it) => (
                          <View key={it.topic} style={styles.readoutCurioChip}>
                            <Text style={styles.readoutCurioText}>{it.display}</Text>
                          </View>
                        ))}
                      </View>
                    ) : null}
                  </View>
                </View>
              ) : (
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
              )}
              {activeIdx === null && (
                <Text style={styles.scrubHint}>tap or drag the chart to explore</Text>
              )}
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

        {/* OUR STORY */}
        <View style={styles.card} testID="growth-story">
          <Text style={styles.cardTitle}>OUR STORY</Text>
          <Text style={styles.cardSub}>
            the chapters our months together have written
          </Text>
          {chapters.length === 0 ? (
            <Text style={styles.emptyLine}>
              Our first chapter is still being written — keep talking with me.
            </Text>
          ) : (
            <View style={styles.chapterList}>
              {chapters.map((c, i) => (
                <View key={`${c.from}-${i}`} style={styles.chapterRow}>
                  <View style={styles.chapterRail}>
                    <View style={styles.chapterDot} />
                    {i < chapters.length - 1 ? (
                      <View style={styles.chapterLine} />
                    ) : null}
                  </View>
                  <View style={styles.chapterBody}>
                    <Text style={styles.chapterWhen}>
                      {chapterPeriodLabel(c.from, c.to)}
                    </Text>
                    <Text style={styles.chapterText}>{c.text}</Text>
                    {c.themes.length > 0 ? (
                      <View style={styles.themeRow}>
                        {c.themes.map((t) => (
                          <View key={t} style={styles.themeChip}>
                            <Text style={styles.themeChipText}>{t}</Text>
                          </View>
                        ))}
                      </View>
                    ) : null}
                  </View>
                </View>
              ))}
            </View>
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
                    style={[
                      styles.curioDot,
                      c.isNow && { backgroundColor: curioAccent },
                    ]}
                  />
                  <View style={styles.flex}>
                    <View style={styles.curioHead}>
                      <Text style={styles.curioTopic}>{c.display}</Text>
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
                            backgroundColor: curioAccent,
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
  retryBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    marginTop: 4,
    paddingHorizontal: 16,
    paddingVertical: 9,
    borderRadius: 999,
    borderWidth: 1,
  },
  retryText: {
    fontFamily: FONTS.semibold,
    fontSize: 13,
    letterSpacing: 0.3,
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
  axisRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 8,
  },
  axisLabel: {
    fontFamily: MONO,
    fontSize: 11,
    color: "rgba(255,255,255,0.4)",
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
  chapterList: {
    marginTop: 16,
  },
  chapterRow: {
    flexDirection: "row",
    gap: 12,
  },
  chapterRail: {
    alignItems: "center",
    width: 10,
  },
  chapterDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginTop: 5,
    backgroundColor: "rgba(181,140,255,0.85)",
  },
  chapterLine: {
    flex: 1,
    width: 1.5,
    marginTop: 3,
    marginBottom: 3,
    backgroundColor: "rgba(255,255,255,0.12)",
  },
  chapterBody: {
    flex: 1,
    paddingBottom: 18,
  },
  chapterWhen: {
    fontFamily: MONO,
    fontSize: 11,
    letterSpacing: 1,
    color: "rgba(255,255,255,0.4)",
  },
  chapterText: {
    fontFamily: FONTS.regular,
    fontSize: 14.5,
    lineHeight: 21,
    color: "rgba(255,255,255,0.86)",
    marginTop: 5,
  },
  themeRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    marginTop: 8,
  },
  themeChip: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.14)",
    backgroundColor: "rgba(255,255,255,0.05)",
    paddingHorizontal: 9,
    paddingVertical: 3,
  },
  themeChipText: {
    fontFamily: MONO,
    fontSize: 10.5,
    letterSpacing: 0.5,
    color: "rgba(255,255,255,0.55)",
    textTransform: "lowercase",
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
  },
  readout: {
    marginTop: 14,
    padding: 12,
    borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
  },
  readoutDate: {
    fontFamily: MONO,
    fontSize: 11,
    letterSpacing: 1.2,
    color: "rgba(255,255,255,0.5)",
    marginBottom: 10,
    textTransform: "uppercase",
  },
  readoutTraits: {
    gap: 7,
  },
  readoutTraitRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  readoutDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
  },
  readoutTraitLabel: {
    flex: 1,
    fontFamily: FONTS.medium,
    fontSize: 13,
    color: "rgba(255,255,255,0.7)",
  },
  readoutTraitVal: {
    fontFamily: FONTS.semibold,
    fontSize: 13,
    width: 34,
    textAlign: "right",
  },
  readoutCurioRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 5,
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.07)",
  },
  readoutCurioChip: {
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 2,
    backgroundColor: "rgba(255,197,110,0.14)",
    borderWidth: 1,
    borderColor: "rgba(255,197,110,0.2)",
  },
  readoutCurioText: {
    fontFamily: MONO,
    fontSize: 10,
    letterSpacing: 0.3,
    color: "rgba(255,197,110,0.8)",
    textTransform: "lowercase",
  },
  scrubHint: {
    fontFamily: MONO,
    fontSize: 10,
    letterSpacing: 0.8,
    color: "rgba(255,255,255,0.22)",
    textAlign: "center",
    marginTop: 10,
  },
});
