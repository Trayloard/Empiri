import { Feather } from "@expo/vector-icons";
import {
  clearCompanionMemory,
  getCompanionMemory,
  getCompanionSelf,
  updateCompanionMemory,
  type CompanionInterest,
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
  TextInput,
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
import { accentForWarmth } from "@/lib/accent";

import { GrowthTimeline } from "./GrowthTimeline";

// The sheet's own neutral accent (spinners etc.) — the mind-map's trait hue.
const SHEET_ACCENT = "#B58CFF";
// The sheet is always rendered on the fixed dark backdrop, so it tints along
// the same brand spectrum regardless of the app color scheme.
const SHEET_SPECTRUM = ["#5B8CFF", "#A855F7", "#EC4899", "#FB923C"] as const;

type SheetMode = "mind" | "growth" | "memory";

// Tab presentation for the three inner-self views (mind map, growth timeline,
// and the rolling memory recap).
const MODE_ICON: Record<SheetMode, React.ComponentProps<typeof Feather>["name"]> = {
  mind: "share-2",
  growth: "trending-up",
  memory: "book-open",
};
const MODE_LABEL: Record<SheetMode, string> = {
  mind: "MIND",
  growth: "GROWTH",
  memory: "MEMORY",
};
const MODE_A11Y: Record<SheetMode, string> = {
  mind: "Mind map",
  growth: "How I've grown",
  memory: "What I remember",
};

interface InnerSelfSheetProps {
  visible: boolean;
  conversationId: number | null;
  onClose: () => void;
  /**
   * Smoothed personality warmth (see `useSmoothedWarmth`). Gently tints the
   * sheet's accents toward the personality's warm/cool pole; `0` (or omitted)
   * keeps today's exact colors.
   */
  warmth?: number;
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

// ── Visual-only grouping of curiosities ──────────────────────────────────
// Closely related interests (e.g. "galaxies", "astrophysics", "stars") are
// shown together under a single theme so the curiosities surface reads as
// coherent instead of repetitive. The theme assignments come from the server
// (`self.themes`), which groups topics by meaning — so synonyms, subfields and
// typos land together, and themes adapt as Empiri learns new interests. This
// is a display-time clustering only — the underlying interests stay
// individual; nothing about how they're stored, weighted, or how Empiri's
// personality forms changes. When the server map is unavailable, a shared
// singular/plural root still catches plain pairs; everything else is shown on
// its own, exactly as before.
// Light singular/plural normaliser used by the shared-root fallback
// (galaxies→galaxy, stars→star). Deliberately simple.
function singularize(w: string): string {
  if (w.length > 4 && w.endsWith("ies")) return `${w.slice(0, -3)}y`;
  if (w.length > 4 && w.endsWith("ses")) return w.slice(0, -2);
  if (w.length > 3 && w.endsWith("s") && !w.endsWith("ss")) {
    return w.slice(0, -1);
  }
  return w;
}

type InterestItem =
  | { kind: "single"; orig: number; topic: string; display: string; affinity: number }
  | {
      kind: "theme";
      label: string;
      members: { topic: string; affinity: number }[];
    };

// Blend member affinities into one "combined weight" so a cluster glows at
// least as strongly as its strongest curiosity, with extra members nudging it
// brighter (diminishing returns) — never past the 0–100 ceiling.
function combinedWeight(members: { affinity: number }[]): number {
  const sorted = members.map((m) => clamp(m.affinity)).sort((a, b) => b - a);
  let v = sorted[0] ?? 0;
  for (let i = 1; i < sorted.length; i++) v += sorted[i] * 0.35;
  return clamp(v);
}

// Cluster interests for display: the server's meaning-based theme map first,
// then a shared-root fallback for plain singular/plural pairs the map missed
// (or when it's unavailable). A bucket only becomes a theme when it holds 2+
// members; everything else (including lone theme matches) stays an individual
// curiosity, preserving the original ordering.
function groupInterests(
  interests: CompanionInterest[],
  themes: Record<string, string> | null | undefined,
): InterestItem[] {
  const keys: (string | null)[] = interests.map(
    (it) => themes?.[it.topic] ?? null,
  );

  const rootOf = (t: string): string => {
    const first =
      t.toLowerCase().trim().split(/[^a-z0-9]+/).filter(Boolean)[0] ?? "";
    return singularize(first);
  };
  const rootCounts: Record<string, number> = {};
  interests.forEach((it, i) => {
    if (keys[i] != null) return;
    const r = rootOf(it.topic);
    if (r.length >= 3) rootCounts[r] = (rootCounts[r] ?? 0) + 1;
  });
  interests.forEach((it, i) => {
    if (keys[i] != null) return;
    const r = rootOf(it.topic);
    if (r.length >= 3 && (rootCounts[r] ?? 0) >= 2) keys[i] = `root:${r}`;
  });

  const order: string[] = [];
  const buckets = new Map<string, number[]>();
  keys.forEach((k, i) => {
    const bk = k ?? `solo:${i}`;
    const list = buckets.get(bk);
    if (list) {
      list.push(i);
    } else {
      buckets.set(bk, [i]);
      order.push(bk);
    }
  });

  const items: InterestItem[] = [];
  for (const bk of order) {
    const idxs = buckets.get(bk) ?? [];
    if (idxs.length < 2 || bk.startsWith("solo:")) {
      for (const i of idxs) {
        items.push({
          kind: "single",
          orig: i,
          topic: interests[i].topic,
          display: interests[i].display,
          affinity: interests[i].affinity,
        });
      }
      continue;
    }
    const members = idxs
      .map((i) => ({
        topic: interests[i].topic,
        affinity: interests[i].affinity,
      }))
      .sort((a, b) => b.affinity - a.affinity);
    const label = bk.startsWith("root:") ? titleCase(members[0].topic) : bk;
    items.push({ kind: "theme", label, members });
  }
  return items;
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
    groupInterests(self.interests, self.themes).map((item) => {
      if (item.kind === "single") {
        return {
          id: `interest-${item.orig}`,
          label: item.display.toUpperCase(),
          value: clamp(item.affinity),
          detail: {
            title: item.display,
            role: "Curiosity · caught its eye",
            blurb:
              "Something you've talked about that's started to matter to Empiri.",
            valueLabel: affinityPhrase(item.affinity),
            valuePct: clamp(item.affinity),
          },
        };
      }
      const value = combinedWeight(item.members);
      const slug = item.label.toLowerCase().replace(/[^a-z0-9]+/g, "-");
      const shown = item.members.slice(0, 6);
      const lines = shown.map(
        (m) => `${m.topic.toUpperCase()} · ${affinityPhrase(m.affinity)}`,
      );
      if (item.members.length > shown.length) {
        lines.push(`+${item.members.length - shown.length} more`);
      }
      return {
        id: `interest-theme-${slug}`,
        label: `${item.label.toUpperCase()} ·${item.members.length}`,
        value,
        detail: {
          title: item.label,
          role: `Theme · ${item.members.length} curiosities`,
          blurb:
            "A few related things you keep coming back to, gathered into one curiosity.",
          valueLabel: affinityPhrase(value),
          valuePct: value,
          lines,
        },
      };
    }),
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
  warmth = 0,
}: InnerSelfSheetProps) {
  // Centre-anchored personality tint — neutral warmth keeps today's accent.
  const sheetAccent = accentForWarmth(warmth, SHEET_ACCENT, SHEET_SPECTRUM);
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const reduceMotion = useReducedMotion();

  const [self, setSelf] = useState<CompanionSelf | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [selected, setSelected] = useState<GNode | null>(null);
  const [mode, setMode] = useState<SheetMode>("mind");
  const [memory, setMemory] = useState<string | null>(null);
  const [memoryLoading, setMemoryLoading] = useState(false);
  const [memoryError, setMemoryError] = useState(false);
  // Light control over the memory: inline editing, clearing (with an inline
  // confirm so it works everywhere, including web), and save/clear progress.
  const [memoryEditing, setMemoryEditing] = useState(false);
  const [memoryDraft, setMemoryDraft] = useState("");
  const [memorySaving, setMemorySaving] = useState(false);
  const [memoryConfirmClear, setMemoryConfirmClear] = useState(false);
  const [memoryActionError, setMemoryActionError] = useState<string | null>(
    null,
  );
  // Bumping these re-runs the matching fetch effect — the in-place "Try
  // again" path for transient failures.
  const [selfAttempt, setSelfAttempt] = useState(0);
  const [memoryAttempt, setMemoryAttempt] = useState(0);

  // Durable personal facts Empiri holds about the user, most salient first.
  const facts = self?.facts ?? [];

  const switchMode = (next: SheetMode) => {
    if (next === mode) return;
    if (Platform.OS !== "web") {
      Haptics.selectionAsync().catch(() => {});
    }
    setSelected(null);
    setMode(next);
  };

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
  }, [visible, conversationId, selfAttempt]);

  // Empiri's rolling memory of earlier messages (read-only). Fetched alongside
  // the self so the Memory tab is ready the moment it's opened.
  useEffect(() => {
    if (!visible || conversationId == null) return;
    let cancelled = false;
    setMemoryLoading(true);
    setMemoryError(false);
    getCompanionMemory(conversationId)
      .then((data) => {
        if (!cancelled) setMemory(data.summary ?? null);
      })
      .catch(() => {
        if (!cancelled) setMemoryError(true);
      })
      .finally(() => {
        if (!cancelled) setMemoryLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [visible, conversationId, memoryAttempt]);

  // Reset the open detail card and view mode whenever the sheet is dismissed.
  useEffect(() => {
    if (!visible) {
      setSelected(null);
      setMode("mind");
      setMemoryEditing(false);
      setMemoryConfirmClear(false);
      setMemoryActionError(null);
    }
  }, [visible]);

  const startMemoryEdit = () => {
    if (memory == null) return;
    setMemoryActionError(null);
    setMemoryConfirmClear(false);
    setMemoryDraft(memory);
    setMemoryEditing(true);
  };

  const cancelMemoryEdit = () => {
    setMemoryEditing(false);
    setMemoryActionError(null);
  };

  const saveMemoryEdit = async () => {
    if (conversationId == null || memorySaving) return;
    const trimmed = memoryDraft.trim();
    if (!trimmed) {
      setMemoryActionError("The memory can't be empty — use Forget instead.");
      return;
    }
    setMemorySaving(true);
    setMemoryActionError(null);
    try {
      const updated = await updateCompanionMemory(conversationId, {
        summary: trimmed,
      });
      setMemory(updated.summary ?? null);
      setMemoryEditing(false);
      if (Platform.OS !== "web") {
        Haptics.notificationAsync(
          Haptics.NotificationFeedbackType.Success,
        ).catch(() => {});
      }
    } catch {
      setMemoryActionError("Couldn't save just now. Please try again.");
    } finally {
      setMemorySaving(false);
    }
  };

  const clearMemory = async () => {
    if (conversationId == null || memorySaving) return;
    setMemorySaving(true);
    setMemoryActionError(null);
    try {
      await clearCompanionMemory(conversationId);
      setMemory(null);
      setMemoryEditing(false);
      setMemoryConfirmClear(false);
      if (Platform.OS !== "web") {
        Haptics.notificationAsync(
          Haptics.NotificationFeedbackType.Success,
        ).catch(() => {});
      }
    } catch {
      setMemoryActionError("Couldn't forget just now. Please try again.");
    } finally {
      setMemorySaving(false);
    }
  };

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

        <View style={styles.segmentWrap}>
          <View style={styles.segment}>
            {(["mind", "growth", "memory"] as SheetMode[]).map((m) => {
              const active = mode === m;
              return (
                <Pressable
                  key={m}
                  onPress={() => switchMode(m)}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                  accessibilityLabel={MODE_A11Y[m]}
                  testID={`mode-${m}`}
                  style={[styles.segmentBtn, active && styles.segmentBtnActive]}
                >
                  <Feather
                    name={MODE_ICON[m]}
                    size={13}
                    color={active ? "#0A0B12" : "rgba(255,255,255,0.6)"}
                  />
                  <Text
                    style={[
                      styles.segmentText,
                      active && styles.segmentTextActive,
                    ]}
                  >
                    {MODE_LABEL[m]}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        {mode === "mind" ? (
          <>
            <View style={styles.caption}>
              <Text style={styles.captionTitle}>EMPIRI&apos;S MIND</Text>
              <Text style={styles.captionSub}>tap a node to look closer</Text>
            </View>

            {loading || conversationId == null ? (
              <View style={styles.statePad}>
                <ActivityIndicator color={sheetAccent} />
              </View>
            ) : error || !self || !graph ? (
              <View style={styles.statePad}>
                <Feather
                  name="cloud-off"
                  size={28}
                  color="rgba(255,255,255,0.5)"
                />
                <Text style={styles.stateText}>
                  Couldn&apos;t peek inside just now.
                </Text>
                {error ? (
                  <Pressable
                    onPress={() => setSelfAttempt((a) => a + 1)}
                    accessibilityRole="button"
                    accessibilityLabel="Try again"
                    testID="retry-self"
                    style={({ pressed }) => [
                      styles.retryBtn,
                      { borderColor: hexA(sheetAccent, 0.55) },
                      pressed ? { opacity: 0.7 } : null,
                    ]}
                  >
                    <Feather name="refresh-cw" size={13} color={sheetAccent} />
                    <Text style={[styles.retryText, { color: sheetAccent }]}>
                      Try again
                    </Text>
                  </Pressable>
                ) : null}
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
          </>
        ) : mode === "growth" ? (
          <>
            <View style={styles.caption}>
              <Text style={styles.captionTitle}>HOW I&apos;VE GROWN</Text>
              <Text style={styles.captionSub}>my inner self, over time</Text>
            </View>
            <GrowthTimeline
              conversationId={conversationId}
              self={self}
              bottomInset={insets.bottom}
              warmth={warmth}
            />
          </>
        ) : (
          <>
            <View style={styles.caption}>
              <Text style={styles.captionTitle}>WHAT I REMEMBER</Text>
              <Text style={styles.captionSub}>the gist of our earlier talks</Text>
            </View>

            {memoryLoading || conversationId == null ? (
              <View style={styles.statePad}>
                <ActivityIndicator color={sheetAccent} />
              </View>
            ) : memoryError && facts.length === 0 ? (
              <View style={styles.statePad}>
                <Feather
                  name="cloud-off"
                  size={28}
                  color="rgba(255,255,255,0.5)"
                />
                <Text style={styles.stateText}>
                  Couldn&apos;t recall just now.
                </Text>
                <Pressable
                  onPress={() => setMemoryAttempt((a) => a + 1)}
                  accessibilityRole="button"
                  accessibilityLabel="Try again"
                  testID="retry-memory"
                  style={({ pressed }) => [
                    styles.retryBtn,
                    { borderColor: hexA(sheetAccent, 0.55) },
                    pressed ? { opacity: 0.7 } : null,
                  ]}
                >
                  <Feather name="refresh-cw" size={13} color={sheetAccent} />
                  <Text style={[styles.retryText, { color: sheetAccent }]}>
                    Try again
                  </Text>
                </Pressable>
              </View>
            ) : !memory && facts.length === 0 ? (
              <View style={styles.statePad}>
                <Feather
                  name="book-open"
                  size={28}
                  color="rgba(255,255,255,0.45)"
                />
                <Text style={styles.stateText}>
                  Nothing to remember yet. As we talk more, I&apos;ll keep the
                  gist of our earlier conversations here.
                </Text>
              </View>
            ) : (
              <ScrollView
                style={styles.scroll}
                contentContainerStyle={[
                  styles.memoryContent,
                  { paddingBottom: insets.bottom + 48 },
                ]}
                showsVerticalScrollIndicator={false}
              >
                {memory ? (
                  <>
                    {memoryEditing ? (
                      <View style={styles.memoryCard}>
                        <TextInput
                          value={memoryDraft}
                          onChangeText={setMemoryDraft}
                          multiline
                          autoFocus
                          editable={!memorySaving}
                          maxLength={2000}
                          style={styles.memoryInput}
                          placeholder="What should Empiri remember?"
                          placeholderTextColor="rgba(255,255,255,0.35)"
                          testID="memory-edit-input"
                        />
                        <View style={styles.memoryActionRow}>
                          <Pressable
                            onPress={cancelMemoryEdit}
                            disabled={memorySaving}
                            accessibilityRole="button"
                            accessibilityLabel="Cancel editing"
                            testID="memory-edit-cancel"
                            style={({ pressed }) => [
                              styles.memoryBtn,
                              { opacity: pressed || memorySaving ? 0.6 : 1 },
                            ]}
                          >
                            <Text style={styles.memoryBtnText}>Cancel</Text>
                          </Pressable>
                          <Pressable
                            onPress={saveMemoryEdit}
                            disabled={memorySaving}
                            accessibilityRole="button"
                            accessibilityLabel="Save memory"
                            testID="memory-edit-save"
                            style={({ pressed }) => [
                              styles.memoryBtn,
                              styles.memoryBtnPrimary,
                              { opacity: pressed || memorySaving ? 0.7 : 1 },
                            ]}
                          >
                            {memorySaving ? (
                              <ActivityIndicator
                                size="small"
                                color="#0A0B12"
                              />
                            ) : (
                              <Text style={styles.memoryBtnPrimaryText}>
                                Save
                              </Text>
                            )}
                          </Pressable>
                        </View>
                      </View>
                    ) : (
                      <>
                        <View style={styles.memoryCard}>
                          <Text style={styles.memoryText} testID="memory-text">
                            {memory}
                          </Text>
                        </View>
                        {memoryConfirmClear ? (
                          <View style={styles.memoryActionRow}>
                            <Text style={styles.memoryConfirmText}>
                              Forget all of this?
                            </Text>
                            <Pressable
                              onPress={() => setMemoryConfirmClear(false)}
                              disabled={memorySaving}
                              accessibilityRole="button"
                              accessibilityLabel="Keep this memory"
                              testID="memory-clear-cancel"
                              style={({ pressed }) => [
                                styles.memoryBtn,
                                { opacity: pressed || memorySaving ? 0.6 : 1 },
                              ]}
                            >
                              <Text style={styles.memoryBtnText}>Keep</Text>
                            </Pressable>
                            <Pressable
                              onPress={clearMemory}
                              disabled={memorySaving}
                              accessibilityRole="button"
                              accessibilityLabel="Yes, forget it"
                              testID="memory-clear-confirm"
                              style={({ pressed }) => [
                                styles.memoryBtn,
                                styles.memoryBtnDanger,
                                { opacity: pressed || memorySaving ? 0.7 : 1 },
                              ]}
                            >
                              {memorySaving ? (
                                <ActivityIndicator
                                  size="small"
                                  color="#FFB4C0"
                                />
                              ) : (
                                <Text style={styles.memoryBtnDangerText}>
                                  Forget
                                </Text>
                              )}
                            </Pressable>
                          </View>
                        ) : (
                          <View style={styles.memoryActionRow}>
                            <Pressable
                              onPress={startMemoryEdit}
                              accessibilityRole="button"
                              accessibilityLabel="Edit what Empiri remembers"
                              testID="memory-edit"
                              style={({ pressed }) => [
                                styles.memoryBtn,
                                { opacity: pressed ? 0.6 : 1 },
                              ]}
                            >
                              <Feather
                                name="edit-2"
                                size={12}
                                color="rgba(231,233,245,0.85)"
                              />
                              <Text style={styles.memoryBtnText}>Edit</Text>
                            </Pressable>
                            <Pressable
                              onPress={() => {
                                setMemoryActionError(null);
                                setMemoryConfirmClear(true);
                              }}
                              accessibilityRole="button"
                              accessibilityLabel="Forget what Empiri remembers"
                              testID="memory-clear"
                              style={({ pressed }) => [
                                styles.memoryBtn,
                                { opacity: pressed ? 0.6 : 1 },
                              ]}
                            >
                              <Feather
                                name="trash-2"
                                size={12}
                                color="rgba(231,233,245,0.85)"
                              />
                              <Text style={styles.memoryBtnText}>Forget</Text>
                            </Pressable>
                          </View>
                        )}
                      </>
                    )}
                    {memoryActionError ? (
                      <Text
                        style={styles.memoryActionErrorText}
                        testID="memory-action-error"
                      >
                        {memoryActionError}
                      </Text>
                    ) : null}
                    <Text style={styles.memoryFootnote}>
                      A gentle recap Empiri keeps so our longer talks stay
                      connected. You can correct it or ask Empiri to forget.
                    </Text>
                  </>
                ) : null}

                {facts.length > 0 ? (
                  <>
                    <Text
                      style={[
                        styles.factsTitle,
                        memory != null && styles.factsTitleSpaced,
                      ]}
                    >
                      LITTLE THINGS I&apos;VE PICKED UP
                    </Text>
                    <View style={styles.factsCard} testID="facts-card">
                      {facts.map((fact, index) => (
                        <View
                          key={fact.key}
                          style={[
                            styles.factRow,
                            index > 0 && styles.factRowDivider,
                          ]}
                        >
                          <View
                            style={[
                              styles.factDot,
                              {
                                backgroundColor: sheetAccent,
                                opacity:
                                  0.35 +
                                  0.65 *
                                    Math.max(
                                      0,
                                      Math.min(1, fact.salience / 100),
                                    ),
                              },
                            ]}
                          />
                          <Text style={styles.factText}>{fact.text}</Text>
                        </View>
                      ))}
                    </View>
                    <Text style={styles.memoryFootnote}>
                      Little things you&apos;ve shared — the ones we return to
                      stay the brightest.
                    </Text>
                  </>
                ) : null}
              </ScrollView>
            )}
          </>
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
  segmentWrap: {
    alignItems: "center",
    paddingTop: 8,
    paddingBottom: 2,
  },
  segment: {
    flexDirection: "row",
    padding: 3,
    borderRadius: 15,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
  },
  segmentBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 13,
    height: 30,
    borderRadius: 12,
  },
  segmentBtnActive: {
    backgroundColor: "#E7E9F5",
  },
  segmentText: {
    fontFamily: MONO,
    fontSize: 11,
    letterSpacing: 1.5,
    color: "rgba(255,255,255,0.6)",
  },
  segmentTextActive: {
    color: "#0A0B12",
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
    flex: 1,
  },
  scrollContent: {
    alignItems: "center",
    paddingTop: 6,
  },
  memoryContent: {
    paddingTop: 6,
    paddingHorizontal: 22,
  },
  memoryCard: {
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "rgba(110,168,255,0.28)",
    backgroundColor: "rgba(110,168,255,0.06)",
    paddingHorizontal: 20,
    paddingVertical: 18,
  },
  memoryText: {
    fontFamily: FONTS.regular,
    fontSize: 15.5,
    lineHeight: 24,
    color: "rgba(231,233,245,0.92)",
  },
  memoryInput: {
    fontFamily: FONTS.regular,
    fontSize: 15.5,
    lineHeight: 24,
    color: "rgba(231,233,245,0.92)",
    minHeight: 120,
    textAlignVertical: "top",
    padding: 0,
  },
  memoryActionRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: 10,
    marginTop: 12,
  },
  memoryBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.16)",
    backgroundColor: "rgba(255,255,255,0.05)",
  },
  memoryBtnText: {
    fontFamily: FONTS.semibold,
    fontSize: 13,
    color: "rgba(231,233,245,0.85)",
  },
  memoryBtnPrimary: {
    borderColor: "rgba(231,233,245,0.9)",
    backgroundColor: "#E7E9F5",
    minWidth: 72,
    justifyContent: "center",
  },
  memoryBtnPrimaryText: {
    fontFamily: FONTS.semibold,
    fontSize: 13,
    color: "#0A0B12",
  },
  memoryBtnDanger: {
    borderColor: "rgba(255,126,150,0.5)",
    backgroundColor: "rgba(255,126,150,0.12)",
    minWidth: 82,
    justifyContent: "center",
  },
  memoryBtnDangerText: {
    fontFamily: FONTS.semibold,
    fontSize: 13,
    color: "#FFB4C0",
  },
  memoryConfirmText: {
    flex: 1,
    fontFamily: FONTS.medium,
    fontSize: 13.5,
    color: "rgba(255,255,255,0.65)",
  },
  memoryActionErrorText: {
    fontFamily: FONTS.medium,
    fontSize: 12.5,
    lineHeight: 18,
    color: "#FFB4C0",
    marginTop: 10,
    textAlign: "center",
  },
  memoryFootnote: {
    fontFamily: FONTS.regular,
    fontSize: 12.5,
    lineHeight: 18,
    color: "rgba(255,255,255,0.4)",
    textAlign: "center",
    marginTop: 16,
    paddingHorizontal: 12,
  },
  factsTitle: {
    fontFamily: FONTS.semibold,
    fontSize: 11.5,
    letterSpacing: 2,
    color: "rgba(255,255,255,0.55)",
    marginBottom: 10,
    paddingHorizontal: 2,
  },
  factsTitleSpaced: {
    marginTop: 26,
  },
  factsCard: {
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.14)",
    backgroundColor: "rgba(255,255,255,0.04)",
    paddingHorizontal: 18,
    paddingVertical: 6,
  },
  factRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
  },
  factRowDivider: {
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.08)",
  },
  factDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 12,
  },
  factText: {
    flex: 1,
    fontFamily: FONTS.regular,
    fontSize: 14.5,
    lineHeight: 21,
    color: "rgba(231,233,245,0.92)",
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
