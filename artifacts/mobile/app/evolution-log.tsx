import { Feather } from "@expo/vector-icons";
import {
  getCompanionSelfHistory,
  type CompanionSelfSnapshot,
} from "@workspace/api-client-react";
import { Redirect, useRouter } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { FONTS } from "@/constants/fonts";
import { useCompanion } from "@/contexts/CompanionContext";
import { useColors } from "@/hooks/useColors";
import {
  describeSnapshot,
  dominantTraits,
  formatSnapshotDate,
  traitLabel,
} from "@/lib/evolution";
import { useAuth } from "@/lib/auth";

export default function EvolutionLogScreen() {
  const router = useRouter();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { conversationId } = useCompanion();
  const { isAuthenticated, isLoading: authLoading } = useAuth();

  const [snapshots, setSnapshots] = useState<CompanionSelfSnapshot[] | null>(
    null,
  );
  const [loadError, setLoadError] = useState<boolean>(false);

  const load = useCallback(async () => {
    if (conversationId == null) return;
    setLoadError(false);
    setSnapshots(null);
    try {
      const { snapshots: rows } = await getCompanionSelfHistory(conversationId);
      // The API returns oldest-first; the log reads newest-first.
      setSnapshots([...rows].reverse());
    } catch {
      setLoadError(true);
    }
  }, [conversationId]);

  useEffect(() => {
    load();
  }, [load]);

  // Same auth pattern as the other screens: wait for the auth check, then
  // send signed-out users to the root screen, which shows the login gate.
  if (authLoading) {
    return (
      <View style={[styles.root, styles.center, { backgroundColor: colors.background }]}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  if (!isAuthenticated) {
    return <Redirect href="/" />;
  }

  const loading = !loadError && snapshots === null && conversationId != null;

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View
        style={[
          styles.header,
          {
            paddingTop: insets.top + 10,
            borderBottomColor: colors.border,
          },
        ]}
      >
        <Pressable
          onPress={() => router.back()}
          accessibilityRole="button"
          accessibilityLabel="Go back"
          hitSlop={12}
          style={({ pressed }) => [
            styles.backBtn,
            { backgroundColor: colors.muted, opacity: pressed ? 0.6 : 1 },
          ]}
        >
          <Feather name="arrow-left" size={20} color={colors.foreground} />
        </Pressable>

        <Text style={[styles.headerTitle, { color: colors.foreground }]}>
          Evolution log
        </Text>

        {/* Spacer to center title */}
        <View style={styles.backBtn} />
      </View>

      {loading ? (
        <View style={[styles.flex, styles.center]}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : loadError ? (
        <View style={[styles.flex, styles.center, styles.statePad]}>
          <Feather name="cloud-off" size={28} color={colors.mutedForeground} />
          <Text style={[styles.stateTitle, { color: colors.foreground }]}>
            Couldn't load the log
          </Text>
          <Text style={[styles.stateBody, { color: colors.mutedForeground }]}>
            Something went wrong while fetching Empiri's history.
          </Text>
          <Pressable
            onPress={load}
            accessibilityRole="button"
            accessibilityLabel="Try again"
            style={({ pressed }) => [
              styles.retryBtn,
              { backgroundColor: colors.primary, opacity: pressed ? 0.85 : 1 },
            ]}
          >
            <Text style={[styles.retryText, { color: colors.primaryForeground }]}>
              Try again
            </Text>
          </Pressable>
        </View>
      ) : !snapshots || snapshots.length === 0 ? (
        <View style={[styles.flex, styles.center, styles.statePad]}>
          <Feather name="feather" size={28} color={colors.mutedForeground} />
          <Text style={[styles.stateTitle, { color: colors.foreground }]}>
            No history yet
          </Text>
          <Text style={[styles.stateBody, { color: colors.mutedForeground }]}>
            As you talk, Empiri's inner self slowly takes shape. Moments of
            growth will appear here.
          </Text>
        </View>
      ) : (
        <FlatList
          data={snapshots}
          keyExtractor={(item) => item.capturedAt}
          contentContainerStyle={[
            styles.list,
            { paddingBottom: insets.bottom + 32 },
          ]}
          renderItem={({ item, index }) => (
            <View style={styles.row}>
              {/* Timeline rail */}
              <View style={styles.rail}>
                <View
                  style={[
                    styles.railLineTop,
                    {
                      backgroundColor:
                        index === 0 ? "transparent" : colors.border,
                    },
                  ]}
                />
                <View style={[styles.dot, { backgroundColor: colors.primary }]} />
                <View
                  style={[
                    styles.railLineBottom,
                    {
                      backgroundColor:
                        index === snapshots.length - 1
                          ? "transparent"
                          : colors.border,
                    },
                  ]}
                />
              </View>

              {/* Entry card */}
              <View
                style={[
                  styles.card,
                  { backgroundColor: colors.muted, borderColor: colors.border },
                ]}
              >
                <Text style={[styles.date, { color: colors.mutedForeground }]}>
                  {formatSnapshotDate(item.capturedAt)}
                </Text>
                <Text style={[styles.sentence, { color: colors.foreground }]}>
                  {describeSnapshot(item)}
                </Text>
                <View style={styles.chips}>
                  {dominantTraits(item.traits).map((t) => (
                    <View
                      key={t.key}
                      style={[
                        styles.chip,
                        {
                          borderColor: colors.border,
                          backgroundColor: colors.background,
                        },
                      ]}
                    >
                      <Text style={[styles.chipText, { color: colors.foreground }]}>
                        {traitLabel(t.key)}
                      </Text>
                    </View>
                  ))}
                </View>
              </View>
            </View>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  flex: { flex: 1 },
  center: {
    alignItems: "center",
    justifyContent: "center",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingBottom: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  backBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: {
    fontSize: 17,
    fontFamily: FONTS.semibold,
    letterSpacing: -0.3,
  },
  list: {
    paddingHorizontal: 20,
    paddingTop: 20,
  },
  row: {
    flexDirection: "row",
  },
  rail: {
    width: 24,
    alignItems: "center",
  },
  railLineTop: {
    width: 2,
    height: 26,
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  railLineBottom: {
    width: 2,
    flex: 1,
  },
  card: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginLeft: 10,
    marginBottom: 14,
  },
  date: {
    fontSize: 11,
    fontFamily: FONTS.semibold,
    letterSpacing: 0.7,
    textTransform: "uppercase",
  },
  sentence: {
    fontSize: 15,
    fontFamily: FONTS.regular,
    marginTop: 6,
    lineHeight: 21,
  },
  chips: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    marginTop: 10,
  },
  chip: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  chipText: {
    fontSize: 12,
    fontFamily: FONTS.semibold,
  },
  statePad: {
    paddingHorizontal: 40,
    gap: 8,
  },
  stateTitle: {
    fontSize: 16,
    fontFamily: FONTS.semibold,
    marginTop: 6,
  },
  stateBody: {
    fontSize: 13.5,
    fontFamily: FONTS.regular,
    textAlign: "center",
    lineHeight: 20,
  },
  retryBtn: {
    borderRadius: 14,
    paddingHorizontal: 22,
    paddingVertical: 10,
    marginTop: 10,
  },
  retryText: {
    fontSize: 14,
    fontFamily: FONTS.semibold,
  },
});
