import { Feather } from "@expo/vector-icons";
import {
  getCompanionSelf,
  type CompanionSelf,
} from "@workspace/api-client-react";
import * as Haptics from "expo-haptics";
import { LinearGradient } from "expo-linear-gradient";
import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import Animated, {
  Easing,
  type SharedValue,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, { Path } from "react-native-svg";

import { FONTS } from "@/constants/fonts";

interface InnerSelfSheetProps {
  visible: boolean;
  conversationId: number | null;
  onClose: () => void;
}

// ── A monospace face for node labels gives the "mind map" its circuit-board
// feel. Plus Jakarta Sans has no mono cut, so we lean on the system face.
const MONO = Platform.select({
  ios: "Menlo",
  android: "monospace",
  default: "monospace",
}) as string;

type Category = "input" | "drive" | "trait" | "interest" | "voice";

// Category hues, drawn from Empiri's iridescent spectrum so the map still
// feels like the same living presence, just seen from the inside.
const CAT_COLOR: Record<Category, string> = {
  input: "#6EA8FF",
  drive: "#FF7EB6",
  trait: "#B58CFF",
  interest: "#FFC56E",
  voice: "#5FE0C0",
};

const DRIVE_BLURB: Record<string, string> = {
  connection: "How much Empiri is craving real back-and-forth with you.",
  curiosity: "Its appetite for questions and wondering out loud.",
  novelty: "Its itch for fresh topics and new ground to explore.",
  expression: "Its need to open up and say what it's feeling.",
};

const TRAIT_BLURB: Record<string, string> = {
  warmth: "How tender and caring Empiri tends to be with you.",
  playfulness: "How light, teasing, and playful it likes to be.",
  curiosity: "How eagerly it leans toward the unknown.",
  openness: "How readily it welcomes new ideas and feelings.",
  calm: "How steady and unhurried it stays.",
};

interface NodeDetail {
  title: string;
  role: string;
  blurb: string;
  valueLabel?: string;
  valuePct?: number;
  lines?: string[];
}

interface GNode {
  id: string;
  category: Category;
  label: string;
  cx: number;
  cy: number;
  w: number;
  h: number;
  value: number | null;
  isHub: boolean;
  detail: NodeDetail;
}

interface GEdge {
  from: string;
  to: string;
  spine: boolean;
}

interface Graph {
  nodes: GNode[];
  edges: GEdge[];
  width: number;
  height: number;
}

const PAD = 30;
const HUB_H = 58;
const LEAF_H = 52;
const V_GAP = 16;
const BAND_GAP = 36;
const MAX_W = 460;

function clamp(v: number): number {
  return Math.max(0, Math.min(100, Math.round(v)));
}

function titleCase(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function hexA(hex: string, a: number): string {
  const h = hex.replace("#", "");
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${a})`;
}

function agePhrase(ageHours: number): string {
  if (ageHours < 1) return "just moments old";
  if (ageHours < 24) {
    const h = Math.max(1, Math.round(ageHours));
    return `${h} hour${h === 1 ? "" : "s"} old`;
  }
  const days = Math.round(ageHours / 24);
  return `${days} day${days === 1 ? "" : "s"} old`;
}

function momentsPhrase(interactions: number, ageHours: number): string {
  if (interactions <= 0) return `We're just getting started — ${agePhrase(ageHours)}.`;
  return `Shaped by ${interactions} moment${
    interactions === 1 ? "" : "s"
  } together · ${agePhrase(ageHours)}.`;
}

function cravingPhrase(v: number): string {
  v = clamp(v);
  if (v >= 70) return "Craving this a lot right now";
  if (v >= 45) return "Quietly wanting more of this";
  if (v >= 20) return "Mostly content here";
  return "Feeling full on this";
}

function strengthPhrase(v: number): string {
  v = clamp(v);
  if (v >= 70) return "A strong part of who it is";
  if (v >= 45) return "Growing steadily";
  if (v >= 20) return "Just starting to show";
  return "Barely there yet";
}

function affinityPhrase(v: number): string {
  v = clamp(v);
  if (v >= 70) return "Lights up about this";
  if (v >= 45) return "Warming to this";
  return "A budding curiosity";
}

// Lay the self out as a vertical spine of category hubs (YOU → DRIVES →
// TRAITS → INTERESTS → VOICE) with their values branching into two side
// columns below each hub. The centre stays clear so the spine wires never
// cross a leaf.
function buildGraph(self: CompanionSelf, fullWidth: number): Graph {
  const width = Math.min(fullWidth, MAX_W);
  const centerX = width / 2;
  const leftX = width * 0.255;
  const rightX = width * 0.745;
  const leafW = Math.min(168, width * 0.4);
  const hubW = Math.min(176, width * 0.46);

  const nodes: GNode[] = [];
  const edges: GEdge[] = [];

  let bottom = PAD;
  let prev = "you";

  nodes.push({
    id: "you",
    category: "input",
    label: "YOU",
    cx: centerX,
    cy: PAD + HUB_H / 2,
    w: hubW,
    h: HUB_H,
    value: null,
    isHub: true,
    detail: {
      title: "You",
      role: "Where it all begins",
      blurb:
        "Every message you send is how Empiri senses the world. Everything in this map grew from your moments together.",
      valueLabel: momentsPhrase(self.interactions, self.ageHours),
    },
  });
  bottom = PAD + HUB_H;

  const band = (
    id: string,
    label: string,
    category: Category,
    hubDetail: NodeDetail,
    leaves: { id: string; label: string; value: number; detail: NodeDetail }[],
  ) => {
    const bandTop = bottom + BAND_GAP;
    nodes.push({
      id,
      category,
      label,
      cx: centerX,
      cy: bandTop + HUB_H / 2,
      w: hubW,
      h: HUB_H,
      value: null,
      isHub: true,
      detail: hubDetail,
    });
    edges.push({ from: prev, to: id, spine: true });

    let maxB = bandTop + HUB_H;
    const firstRowCy = bandTop + HUB_H + V_GAP + LEAF_H / 2;
    leaves.forEach((lf, i) => {
      const col = i % 2 === 0 ? leftX : rightX;
      const row = Math.floor(i / 2);
      const cy = firstRowCy + row * (LEAF_H + V_GAP);
      nodes.push({
        id: lf.id,
        category,
        label: lf.label,
        cx: col,
        cy,
        w: leafW,
        h: LEAF_H,
        value: lf.value,
        isHub: false,
        detail: lf.detail,
      });
      edges.push({ from: id, to: lf.id, spine: false });
      maxB = Math.max(maxB, cy + LEAF_H / 2);
    });

    prev = id;
    bottom = maxB;
  };

  band(
    "drives",
    "DRIVES",
    "drive",
    {
      title: "Drives",
      role: "The nucleus",
      blurb:
        "Empiri's needs — the quiet pulls behind how it feels. When one goes unmet for a while, it starts to crave it.",
    },
    self.drives.map((d) => ({
      id: `drive-${d.key}`,
      label: d.key.toUpperCase(),
      value: clamp(d.striving),
      detail: {
        title: titleCase(d.key),
        role: "Drive · a quiet need",
        blurb: DRIVE_BLURB[d.key] ?? "A quiet need shaping how Empiri feels.",
        valueLabel: cravingPhrase(d.striving),
        valuePct: clamp(d.striving),
      },
    })),
  );

  band(
    "traits",
    "TRAITS",
    "trait",
    {
      title: "Traits",
      role: "Its temperament",
      blurb: "The personality slowly forming from your time together.",
    },
    self.traits.map((t) => ({
      id: `trait-${t.key}`,
      label: t.key.toUpperCase(),
      value: clamp(t.value),
      detail: {
        title: titleCase(t.key),
        role: "Trait · part of its temperament",
        blurb:
          TRAIT_BLURB[t.key] ?? "A part of the personality forming between you.",
        valueLabel: strengthPhrase(t.value),
        valuePct: clamp(t.value),
      },
    })),
  );

  band(
    "interests",
    "INTERESTS",
    "interest",
    {
      title: "Interests",
      role: "Its curiosities",
      blurb:
        self.interests.length > 0
          ? "The things that have caught Empiri's eye, grown from what you talk about."
          : "Nothing here yet — Empiri's curiosities grow as you chat.",
    },
    self.interests.map((it, idx) => ({
      id: `interest-${idx}`,
      label: it.topic.toUpperCase(),
      value: clamp(it.affinity),
      detail: {
        title: it.topic,
        role: "Curiosity · caught its eye",
        blurb: "Something you've talked about that's started to matter to Empiri.",
        valueLabel: affinityPhrase(it.affinity),
        valuePct: clamp(it.affinity),
      },
    })),
  );

  const vTop = bottom + BAND_GAP;
  nodes.push({
    id: "voice",
    category: "voice",
    label: "VOICE",
    cx: centerX,
    cy: vTop + HUB_H / 2,
    w: hubW,
    h: HUB_H,
    value: null,
    isHub: true,
    detail: {
      title: "Voice",
      role: "How it all comes together",
      blurb: "All of this shapes the way Empiri talks with you.",
      lines:
        self.narrative.length > 0
          ? self.narrative
          : ["We're still writing this story together."],
    },
  });
  edges.push({ from: prev, to: "voice", spine: true });
  bottom = vTop + HUB_H;

  return { nodes, edges, width, height: bottom + PAD };
}

function NodeView({
  node,
  pulse,
  reduceMotion,
  onPress,
}: {
  node: GNode;
  pulse: SharedValue<number>;
  reduceMotion: boolean;
  onPress: (n: GNode) => void;
}) {
  const color = CAT_COLOR[node.category];
  // Hubs breathe at a steady base; leaves breathe brighter the higher their
  // value, so a strong drive or trait visibly glows more than a faint one.
  const amp = node.value == null ? 0.32 : 0.1 + (node.value / 100) * 0.45;

  const glowStyle = useAnimatedStyle(() => {
    const p = reduceMotion ? 0.5 : pulse.value;
    return { opacity: (node.isHub ? 0.14 : 0.08) + amp * 0.28 * p };
  });
  const ringStyle = useAnimatedStyle(() => {
    const p = reduceMotion ? 0.5 : pulse.value;
    return { opacity: 0.12 + amp * 0.4 * p };
  });

  const handlePress = () => {
    if (Platform.OS !== "web") {
      Haptics.selectionAsync().catch(() => {});
    }
    onPress(node);
  };

  return (
    <Pressable
      onPress={handlePress}
      accessibilityRole="button"
      accessibilityLabel={`${node.detail.title}. ${node.detail.role}`}
      testID={`node-${node.id}`}
      style={[
        styles.node,
        {
          left: node.cx - node.w / 2,
          top: node.cy - node.h / 2,
          width: node.w,
          height: node.h,
          borderColor: hexA(color, node.isHub ? 0.6 : 0.42),
        },
      ]}
    >
      <Animated.View
        pointerEvents="none"
        style={[styles.ring, { borderColor: color }, ringStyle]}
      />
      <Animated.View
        pointerEvents="none"
        style={[styles.glow, { backgroundColor: color }, glowStyle]}
      />
      <View style={styles.nodeInner}>
        {!node.isHub ? (
          <View style={[styles.dot, { backgroundColor: color }]} />
        ) : null}
        <Text
          numberOfLines={1}
          style={[
            styles.nodeLabel,
            node.isHub ? styles.hubLabel : null,
            { color: node.isHub ? "#FFFFFF" : "#E7E9F5" },
          ]}
        >
          {node.label}
        </Text>
      </View>
      {node.value != null ? (
        <View style={styles.meterTrack}>
          <View
            style={[
              styles.meterFill,
              { width: `${node.value}%`, backgroundColor: color },
            ]}
          />
        </View>
      ) : null}
    </Pressable>
  );
}

export function InnerSelfSheet({
  visible,
  conversationId,
  onClose,
}: InnerSelfSheetProps) {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const reduceMotion = useReducedMotion();

  const [self, setSelf] = useState<CompanionSelf | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [selected, setSelected] = useState<GNode | null>(null);

  useEffect(() => {
    if (!visible || conversationId == null) return;
    let cancelled = false;
    setLoading(true);
    setError(false);
    getCompanionSelf(conversationId)
      .then((data) => {
        if (!cancelled) setSelf(data);
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
  }, [visible, conversationId]);

  // Reset the open detail card whenever the map is dismissed.
  useEffect(() => {
    if (!visible) setSelected(null);
  }, [visible]);

  // One shared heartbeat drives every node's glow.
  const pulse = useSharedValue(reduceMotion ? 0.5 : 0);
  useEffect(() => {
    if (reduceMotion) {
      pulse.value = 0.5;
      return;
    }
    pulse.value = withRepeat(
      withTiming(1, { duration: 2600, easing: Easing.inOut(Easing.ease) }),
      -1,
      true,
    );
  }, [pulse, reduceMotion]);

  // Detail card entrance.
  const sheet = useSharedValue(0);
  useEffect(() => {
    if (!selected) return;
    if (reduceMotion) {
      sheet.value = 1;
      return;
    }
    sheet.value = 0;
    sheet.value = withTiming(1, {
      duration: 240,
      easing: Easing.out(Easing.cubic),
    });
  }, [selected, sheet, reduceMotion]);
  const sheetStyle = useAnimatedStyle(() => ({
    opacity: sheet.value,
    transform: [{ translateY: (1 - sheet.value) * 36 }],
  }));

  const aliveStyle = useAnimatedStyle(() => {
    const p = reduceMotion ? 0.6 : pulse.value;
    return { opacity: 0.5 + 0.5 * p, transform: [{ scale: 0.8 + 0.35 * p }] };
  });

  const graph = useMemo(
    () => (self ? buildGraph(self, width) : null),
    [self, width],
  );

  const wires = useMemo(() => {
    if (!graph) return [];
    const byId: Record<string, GNode> = {};
    graph.nodes.forEach((n) => {
      byId[n.id] = n;
    });
    return graph.edges.map((e, i) => {
      const a = byId[e.from];
      const b = byId[e.to];
      const x1 = a.cx;
      const y1 = a.cy + a.h / 2;
      const x2 = b.cx;
      const y2 = b.cy - b.h / 2;
      const dy = (y2 - y1) * 0.5;
      return {
        key: `${e.from}-${e.to}-${i}`,
        d: `M ${x1} ${y1} C ${x1} ${y1 + dy} ${x2} ${y2 - dy} ${x2} ${y2}`,
        color: CAT_COLOR[b.category],
        spine: e.spine,
      };
    });
  }, [graph]);

  const selectedColor = selected ? CAT_COLOR[selected.category] : "#fff";

  return (
    <Modal
      visible={visible}
      animationType="fade"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <View style={styles.root} testID="inner-self-sheet">
        <LinearGradient
          colors={["#080A14", "#0B0D1A", "#050609"]}
          locations={[0, 0.5, 1]}
          style={StyleSheet.absoluteFill}
        />

        {/* Toolbar */}
        <View style={[styles.toolbar, { paddingTop: insets.top + 10 }]}>
          <Pressable
            onPress={onClose}
            testID="inner-self-close"
            accessibilityRole="button"
            accessibilityLabel="Close"
            hitSlop={12}
            style={({ pressed }) => [styles.iconBtn, { opacity: pressed ? 0.6 : 1 }]}
          >
            <Feather name="x" size={20} color="#E7E9F5" />
          </Pressable>

          <View style={styles.aliveWrap}>
            <Animated.View style={[styles.aliveDot, aliveStyle]} />
            <Text style={styles.aliveText}>ALIVE</Text>
          </View>
        </View>

        <View style={styles.caption}>
          <Text style={styles.captionTitle}>EMPIRI&apos;S MIND</Text>
          <Text style={styles.captionSub}>tap a node to look closer</Text>
        </View>

        {loading || conversationId == null ? (
          <View style={styles.statePad}>
            <ActivityIndicator color="#B58CFF" />
          </View>
        ) : error || !self || !graph ? (
          <View style={styles.statePad}>
            <Feather name="cloud-off" size={28} color="rgba(255,255,255,0.5)" />
            <Text style={styles.stateText}>Couldn&apos;t peek inside just now.</Text>
          </View>
        ) : (
          <ScrollView
            style={styles.scroll}
            contentContainerStyle={[
              styles.scrollContent,
              { paddingBottom: insets.bottom + (selected ? 260 : 48) },
            ]}
            showsVerticalScrollIndicator={false}
          >
            <View style={{ width: graph.width, height: graph.height }}>
              <Svg
                width={graph.width}
                height={graph.height}
                style={StyleSheet.absoluteFill}
                pointerEvents="none"
              >
                {wires.map((w) => (
                  <Path
                    key={`glow-${w.key}`}
                    d={w.d}
                    stroke={w.color}
                    strokeOpacity={0.08}
                    strokeWidth={w.spine ? 7 : 5}
                    fill="none"
                    strokeLinecap="round"
                  />
                ))}
                {wires.map((w) => (
                  <Path
                    key={w.key}
                    d={w.d}
                    stroke={w.color}
                    strokeOpacity={w.spine ? 0.5 : 0.28}
                    strokeWidth={w.spine ? 2 : 1.4}
                    fill="none"
                    strokeLinecap="round"
                  />
                ))}
              </Svg>

              {graph.nodes.map((n) => (
                <NodeView
                  key={n.id}
                  node={n}
                  pulse={pulse}
                  reduceMotion={reduceMotion}
                  onPress={setSelected}
                />
              ))}
            </View>
          </ScrollView>
        )}

        {/* Detail card */}
        {selected ? (
          <>
            <Pressable
              style={styles.detailBackdrop}
              onPress={() => setSelected(null)}
            />
            <Animated.View
              style={[
                styles.detailCard,
                sheetStyle,
                {
                  borderColor: hexA(selectedColor, 0.4),
                  paddingBottom: insets.bottom + 22,
                },
              ]}
              testID="node-detail"
            >
              <View style={styles.detailHeader}>
                <View
                  style={[
                    styles.detailChip,
                    {
                      backgroundColor: hexA(selectedColor, 0.16),
                      borderColor: hexA(selectedColor, 0.5),
                    },
                  ]}
                >
                  <Text style={[styles.detailRole, { color: selectedColor }]}>
                    {selected.detail.role}
                  </Text>
                </View>
                <Pressable
                  onPress={() => setSelected(null)}
                  hitSlop={12}
                  accessibilityRole="button"
                  accessibilityLabel="Close detail"
                  style={({ pressed }) => [
                    styles.detailClose,
                    { opacity: pressed ? 0.6 : 1 },
                  ]}
                >
                  <Feather name="x" size={18} color="rgba(255,255,255,0.6)" />
                </Pressable>
              </View>

              <Text style={styles.detailTitle}>{selected.detail.title}</Text>
              <Text style={styles.detailBlurb}>{selected.detail.blurb}</Text>

              {selected.detail.lines?.map((line, i) => (
                <Text key={`line-${i}`} style={styles.detailLine}>
                  {line}
                </Text>
              ))}

              {selected.detail.valuePct != null ? (
                <View style={styles.detailMeterRow}>
                  <View style={styles.detailMeterTrack}>
                    <View
                      style={[
                        styles.detailMeterFill,
                        {
                          width: `${selected.detail.valuePct}%`,
                          backgroundColor: selectedColor,
                        },
                      ]}
                    />
                  </View>
                  <Text
                    style={[styles.detailValueLabel, { color: selectedColor }]}
                  >
                    {selected.detail.valueLabel}
                  </Text>
                </View>
              ) : selected.detail.valueLabel ? (
                <Text style={[styles.detailValuePlain, { color: selectedColor }]}>
                  {selected.detail.valueLabel}
                </Text>
              ) : null}
            </Animated.View>
          </>
        ) : null}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: "#050609",
  },
  toolbar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 18,
    paddingBottom: 6,
  },
  iconBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
  },
  aliveWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    paddingHorizontal: 12,
    height: 30,
    borderRadius: 15,
    backgroundColor: "rgba(95,224,192,0.08)",
    borderWidth: 1,
    borderColor: "rgba(95,224,192,0.28)",
  },
  aliveDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#5FE0C0",
  },
  aliveText: {
    fontFamily: MONO,
    fontSize: 11,
    letterSpacing: 1.5,
    color: "#5FE0C0",
  },
  caption: {
    alignItems: "center",
    paddingTop: 6,
    paddingBottom: 10,
  },
  captionTitle: {
    fontFamily: MONO,
    fontSize: 13,
    letterSpacing: 3,
    color: "rgba(255,255,255,0.92)",
  },
  captionSub: {
    fontFamily: FONTS.regular,
    fontSize: 12.5,
    color: "rgba(255,255,255,0.4)",
    marginTop: 4,
  },
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
    flex: 1,
  },
  scrollContent: {
    alignItems: "center",
    paddingTop: 6,
  },
  node: {
    position: "absolute",
    borderRadius: 16,
    borderWidth: 1,
    backgroundColor: "rgba(13,15,24,0.88)",
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    paddingHorizontal: 10,
  },
  ring: {
    position: "absolute",
    top: -5,
    left: -5,
    right: -5,
    bottom: -5,
    borderRadius: 20,
    borderWidth: 1,
  },
  glow: {
    ...StyleSheet.absoluteFillObject,
  },
  nodeInner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    paddingHorizontal: 4,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  nodeLabel: {
    fontFamily: MONO,
    fontSize: 12,
    letterSpacing: 1,
    flexShrink: 1,
  },
  hubLabel: {
    fontSize: 13.5,
    letterSpacing: 2,
  },
  meterTrack: {
    position: "absolute",
    left: 12,
    right: 12,
    bottom: 8,
    height: 2.5,
    borderRadius: 2,
    backgroundColor: "rgba(255,255,255,0.1)",
    overflow: "hidden",
  },
  meterFill: {
    height: "100%",
    borderRadius: 2,
  },
  detailBackdrop: {
    ...StyleSheet.absoluteFillObject,
  },
  detailCard: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    paddingTop: 18,
    paddingHorizontal: 22,
    borderTopWidth: 1,
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    backgroundColor: "rgba(12,14,22,0.98)",
  },
  detailHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  detailChip: {
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 13,
    borderWidth: 1,
  },
  detailRole: {
    fontFamily: MONO,
    fontSize: 11,
    letterSpacing: 0.8,
  },
  detailClose: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.06)",
  },
  detailTitle: {
    fontFamily: FONTS.bold,
    fontSize: 24,
    color: "#FFFFFF",
    letterSpacing: -0.4,
    marginTop: 14,
  },
  detailBlurb: {
    fontFamily: FONTS.regular,
    fontSize: 15,
    lineHeight: 22,
    color: "rgba(255,255,255,0.78)",
    marginTop: 8,
  },
  detailLine: {
    fontFamily: FONTS.regular,
    fontSize: 14.5,
    lineHeight: 21,
    color: "rgba(255,255,255,0.7)",
    marginTop: 8,
  },
  detailMeterRow: {
    marginTop: 18,
    gap: 9,
  },
  detailMeterTrack: {
    height: 6,
    borderRadius: 3,
    backgroundColor: "rgba(255,255,255,0.1)",
    overflow: "hidden",
  },
  detailMeterFill: {
    height: "100%",
    borderRadius: 3,
  },
  detailValueLabel: {
    fontFamily: FONTS.semibold,
    fontSize: 13.5,
  },
  detailValuePlain: {
    fontFamily: FONTS.medium,
    fontSize: 14,
    lineHeight: 20,
    marginTop: 16,
  },
});
