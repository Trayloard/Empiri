import { Feather } from "@expo/vector-icons";
import {
  getCompanionSelf,
  type CompanionSelf,
} from "@workspace/api-client-react";
import { BlurView } from "expo-blur";
import { LinearGradient } from "expo-linear-gradient";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { FONTS } from "@/constants/fonts";
import { useColors } from "@/hooks/useColors";

interface InnerSelfSheetProps {
  visible: boolean;
  conversationId: number | null;
  onClose: () => void;
}

function titleCase(key: string): string {
  return key.charAt(0).toUpperCase() + key.slice(1);
}

// Warm, plain-language framing for the bounded 0..100 dials.
function agePhrase(ageHours: number): string {
  if (ageHours < 1) return "just a few moments old";
  if (ageHours < 24) {
    const h = Math.max(1, Math.round(ageHours));
    return `${h} hour${h === 1 ? "" : "s"} old`;
  }
  const days = Math.round(ageHours / 24);
  return `${days} day${days === 1 ? "" : "s"} old`;
}

function momentsPhrase(interactions: number): string {
  if (interactions <= 0) return "We're just getting to know each other.";
  return `Shaped by ${interactions} moment${
    interactions === 1 ? "" : "s"
  } we've shared.`;
}

export function InnerSelfSheet({
  visible,
  conversationId,
  onClose,
}: InnerSelfSheetProps) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const [self, setSelf] = useState<CompanionSelf | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);

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

  const [blue, purple, pink] = colors.spectrum;

  const renderBar = (label: string, value: number, key: string) => {
    const pct = Math.max(0, Math.min(100, value));
    return (
      <View style={styles.barRow} key={key}>
        <View style={styles.barLabelRow}>
          <Text style={[styles.barLabel, { color: colors.foreground }]}>
            {label}
          </Text>
        </View>
        <View style={[styles.barTrack, { backgroundColor: colors.muted }]}>
          <LinearGradient
            colors={[blue, purple, pink]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={[styles.barFill, { width: `${pct}%` }]}
          />
        </View>
      </View>
    );
  };

  const renderSection = (title: string, body: React.ReactNode) => (
    <View style={styles.section}>
      <Text style={[styles.sectionTitle, { color: colors.mutedForeground }]}>
        {title}
      </Text>
      {body}
    </View>
  );

  return (
    <Modal
      visible={visible}
      animationType="fade"
      transparent
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <Pressable style={styles.backdrop} onPress={onClose}>
        <BlurView
          intensity={28}
          tint={colors.blurTint}
          style={StyleSheet.absoluteFill}
        />
        <View style={styles.dim} />
      </Pressable>

      <View style={styles.centerWrap} pointerEvents="box-none">
        <View
          testID="inner-self-sheet"
          style={[
            styles.card,
            {
              backgroundColor: colors.glassStrong,
              borderColor: colors.glassBorder,
              borderRadius: colors.radius,
              marginTop: insets.top + 24,
              marginBottom: insets.bottom + 24,
            },
          ]}
        >
          <View style={styles.header}>
            <View style={styles.headerText}>
              <Text style={[styles.title, { color: colors.foreground }]}>
                Inside Empiri
              </Text>
              <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>
                A peek at how I'm growing
              </Text>
            </View>
            <Pressable
              onPress={onClose}
              testID="inner-self-close"
              accessibilityRole="button"
              accessibilityLabel="Close"
              hitSlop={10}
              style={({ pressed }) => [
                styles.closeBtn,
                {
                  backgroundColor: colors.glass,
                  borderColor: colors.glassBorder,
                  opacity: pressed ? 0.6 : 1,
                },
              ]}
            >
              <Feather name="x" size={18} color={colors.foreground} />
            </Pressable>
          </View>

          {loading || conversationId == null ? (
            <View style={styles.statePad}>
              <ActivityIndicator color={colors.primary} />
            </View>
          ) : error || !self ? (
            <View style={styles.statePad}>
              <Feather
                name="cloud-off"
                size={28}
                color={colors.mutedForeground}
              />
              <Text style={[styles.stateText, { color: colors.mutedForeground }]}>
                Couldn't peek inside just now.
              </Text>
            </View>
          ) : (
            <ScrollView
              style={styles.scroll}
              contentContainerStyle={styles.scrollContent}
              showsVerticalScrollIndicator={false}
            >
              {renderSection(
                "What I'm craving",
                self.drives.map((d) =>
                  renderBar(titleCase(d.key), d.striving, `drive-${d.key}`),
                ),
              )}

              {renderSection(
                "Who I'm becoming",
                self.traits.map((t) =>
                  renderBar(titleCase(t.key), t.value, `trait-${t.key}`),
                ),
              )}

              {self.interests.length > 0
                ? renderSection(
                    "What's caught my eye",
                    <View style={styles.chips}>
                      {self.interests.map((it) => (
                        <View
                          key={`interest-${it.topic}`}
                          style={[
                            styles.chip,
                            {
                              backgroundColor: colors.glass,
                              borderColor: colors.glassBorder,
                              opacity: 0.55 + 0.45 * Math.min(1, it.affinity / 100),
                            },
                          ]}
                        >
                          <Text
                            style={[styles.chipText, { color: colors.foreground }]}
                          >
                            {it.topic}
                          </Text>
                        </View>
                      ))}
                    </View>,
                  )
                : null}

              {self.narrative.length > 0
                ? renderSection(
                    "My story so far",
                    <View style={styles.narrative}>
                      {self.narrative.map((line, i) => (
                        <Text
                          key={`narr-${i}`}
                          style={[
                            styles.narrativeLine,
                            { color: colors.foreground },
                          ]}
                        >
                          {line}
                        </Text>
                      ))}
                    </View>,
                  )
                : null}

              <Text style={[styles.footer, { color: colors.mutedForeground }]}>
                {momentsPhrase(self.interactions)} I'm {agePhrase(self.ageHours)}.
              </Text>
            </ScrollView>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
  },
  dim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.18)",
  },
  centerWrap: {
    flex: 1,
    justifyContent: "center",
    paddingHorizontal: 20,
  },
  card: {
    borderWidth: 1,
    overflow: "hidden",
    maxHeight: "82%",
  },
  header: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    paddingHorizontal: 22,
    paddingTop: 22,
    paddingBottom: 6,
  },
  headerText: {
    flex: 1,
  },
  title: {
    fontSize: 22,
    fontFamily: FONTS.bold,
    letterSpacing: -0.4,
  },
  subtitle: {
    fontSize: 14,
    fontFamily: FONTS.regular,
    marginTop: 2,
  },
  closeBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  statePad: {
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    paddingVertical: 48,
  },
  stateText: {
    fontSize: 14,
    fontFamily: FONTS.medium,
  },
  scroll: {
    flexGrow: 0,
  },
  scrollContent: {
    paddingHorizontal: 22,
    paddingTop: 12,
    paddingBottom: 24,
    gap: 22,
  },
  section: {
    gap: 12,
  },
  sectionTitle: {
    fontSize: 12.5,
    fontFamily: FONTS.semibold,
    letterSpacing: 0.6,
    textTransform: "uppercase",
  },
  barRow: {
    gap: 6,
  },
  barLabelRow: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  barLabel: {
    fontSize: 14,
    fontFamily: FONTS.medium,
  },
  barTrack: {
    height: 8,
    borderRadius: 4,
    overflow: "hidden",
  },
  barFill: {
    height: "100%",
    borderRadius: 4,
  },
  chips: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  chip: {
    paddingHorizontal: 13,
    paddingVertical: 7,
    borderRadius: 16,
    borderWidth: 1,
  },
  chipText: {
    fontSize: 13.5,
    fontFamily: FONTS.medium,
  },
  narrative: {
    gap: 8,
  },
  narrativeLine: {
    fontSize: 14.5,
    lineHeight: 21,
    fontFamily: FONTS.regular,
  },
  footer: {
    fontSize: 13,
    lineHeight: 19,
    fontFamily: FONTS.regular,
    fontStyle: "italic",
  },
});
