import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { Redirect, useRouter } from "expo-router";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { FONTS } from "@/constants/fonts";
import { useCompanion } from "@/contexts/CompanionContext";
import { useColors } from "@/hooks/useColors";
import { useAuth } from "@/lib/auth";
import { t } from "@/lib/i18n";

const TONE_OPTIONS = [
  {
    value: "calm" as const,
    labelKey: "tone.calmLabel" as const,
    descKey: "tone.calmDesc" as const,
    icon: "cloud" as const,
  },
  {
    value: "playful" as const,
    labelKey: "tone.playfulLabel" as const,
    descKey: "tone.playfulDesc" as const,
    icon: "smile" as const,
  },
  {
    value: "witty" as const,
    labelKey: "tone.wittyLabel" as const,
    descKey: "tone.wittyDesc" as const,
    icon: "zap" as const,
  },
  {
    value: "wise" as const,
    labelKey: "tone.wiseLabel" as const,
    descKey: "tone.wiseDesc" as const,
    icon: "book-open" as const,
  },
  {
    value: "cheerful" as const,
    labelKey: "tone.cheerfulLabel" as const,
    descKey: "tone.cheerfulDesc" as const,
    icon: "sun" as const,
  },
];

type ToneValue = (typeof TONE_OPTIONS)[number]["value"];

export default function CompanionSettingsScreen() {
  const router = useRouter();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { settings, saveSettings } = useCompanion();
  const { isAuthenticated, isLoading: authLoading } = useAuth();

  const [name, setName] = useState(settings?.companionName ?? "Empiri");
  const [tone, setTone] = useState<ToneValue>(
    (settings?.tone as ToneValue) ?? "calm",
  );
  const [note, setNote] = useState(settings?.personalityNote ?? "");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  // Keep local state in sync when settings load (e.g. loaded async after render).
  useEffect(() => {
    if (settings) {
      setName(settings.companionName);
      setTone(settings.tone as ToneValue);
      setNote(settings.personalityNote);
    }
  }, [settings]);

  const handleSave = async () => {
    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setSaving(true);
    try {
      await saveSettings({
        companionName: name.trim() || "Empiri",
        tone,
        personalityNote: note,
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } finally {
      setSaving(false);
    }
  };

  // Same auth pattern as the main chat screen: wait for the auth check,
  // then send signed-out users to the root screen, which shows the login gate.
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
          accessibilityLabel={t("a11y.goBack")}
          hitSlop={12}
          style={({ pressed }) => [
            styles.backBtn,
            { backgroundColor: colors.muted, opacity: pressed ? 0.6 : 1 },
          ]}
        >
          <Feather name="arrow-left" size={20} color={colors.foreground} />
        </Pressable>

        <Text style={[styles.headerTitle, { color: colors.foreground }]}>
          {t("companion.headerTitle")}
        </Text>

        {/* Spacer to center title */}
        <View style={styles.backBtn} />
      </View>

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
        <ScrollView
          contentContainerStyle={[
            styles.content,
            { paddingBottom: insets.bottom + 32 },
          ]}
          keyboardShouldPersistTaps="handled"
        >
          {/* Name */}
          <View style={styles.section}>
            <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>
              {t("companion.nameLabel")}
            </Text>
            <TextInput
              value={name}
              onChangeText={setName}
              placeholder="Empiri"
              placeholderTextColor={colors.mutedForeground}
              maxLength={32}
              autoCapitalize="words"
              style={[
                styles.input,
                {
                  color: colors.foreground,
                  backgroundColor: colors.muted,
                  borderColor: colors.border,
                },
              ]}
            />
            <Text style={[styles.hint, { color: colors.mutedForeground }]}>
              {t("companion.nameHint")}
            </Text>
          </View>

          {/* Tone */}
          <View style={styles.section}>
            <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>
              {t("companion.toneLabel")}
            </Text>
            <View style={styles.toneList}>
              {TONE_OPTIONS.map((opt) => {
                const active = opt.value === tone;
                return (
                  <Pressable
                    key={opt.value}
                    onPress={() => {
                      if (Platform.OS !== "web")
                        Haptics.selectionAsync().catch(() => {});
                      setTone(opt.value);
                    }}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: active }}
                    accessibilityLabel={t("a11y.cadenceOption", {
                      label: t(opt.labelKey),
                      description: t(opt.descKey),
                    })}
                    style={({ pressed }) => [
                      styles.toneOption,
                      {
                        borderColor: active ? colors.primary : colors.border,
                        backgroundColor: active ? colors.muted : "transparent",
                        opacity: pressed ? 0.7 : 1,
                      },
                    ]}
                  >
                    <Feather
                      name={opt.icon}
                      size={18}
                      color={active ? colors.primary : colors.mutedForeground}
                      style={styles.toneIcon}
                    />
                    <View style={styles.toneText}>
                      <Text
                        style={[styles.toneLabel, { color: colors.foreground }]}
                      >
                        {t(opt.labelKey)}
                      </Text>
                      <Text
                        style={[
                          styles.toneDesc,
                          { color: colors.mutedForeground },
                        ]}
                      >
                        {t(opt.descKey)}
                      </Text>
                    </View>
                    {active ? (
                      <Feather name="check" size={18} color={colors.primary} />
                    ) : (
                      <View style={styles.checkPlaceholder} />
                    )}
                  </Pressable>
                );
              })}
            </View>
          </View>

          {/* Personality note */}
          <View style={styles.section}>
            <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>
              {t("companion.aboutLabel")}
            </Text>
            <TextInput
              value={note}
              onChangeText={setNote}
              placeholder={t("companion.aboutPlaceholder")}
              placeholderTextColor={colors.mutedForeground}
              multiline
              numberOfLines={4}
              maxLength={500}
              style={[
                styles.textarea,
                {
                  color: colors.foreground,
                  backgroundColor: colors.muted,
                  borderColor: colors.border,
                },
              ]}
            />
            <Text style={[styles.hint, { color: colors.mutedForeground }]}>
              {note.length}/500
            </Text>
          </View>

          {/* Evolution log entry point */}
          <View style={styles.section}>
            <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>
              {t("companion.growthLabel")}
            </Text>
            <Pressable
              onPress={() => router.push("/evolution-log")}
              accessibilityRole="button"
              accessibilityLabel={t("a11y.openEvolutionLog")}
              style={({ pressed }) => [
                styles.linkRow,
                {
                  borderColor: colors.border,
                  backgroundColor: pressed ? colors.muted : "transparent",
                },
              ]}
            >
              <Feather
                name="trending-up"
                size={18}
                color={colors.primary}
                style={styles.linkIcon}
              />
              <View style={styles.linkText}>
                <Text style={[styles.linkLabel, { color: colors.foreground }]}>
                  {t("companion.evolutionLog")}
                </Text>
                <Text style={[styles.linkDesc, { color: colors.mutedForeground }]}>
                  {t("companion.evolutionDesc")}
                </Text>
              </View>
              <Feather
                name="chevron-right"
                size={18}
                color={colors.mutedForeground}
              />
            </Pressable>
          </View>

          {/* Save button */}
          <Pressable
            onPress={handleSave}
            disabled={saving}
            accessibilityRole="button"
            accessibilityLabel={t("a11y.saveCompanionSettings")}
            style={({ pressed }) => [
              styles.saveBtn,
              {
                backgroundColor: saved ? colors.primary : colors.primary,
                opacity: saving ? 0.6 : pressed ? 0.85 : 1,
              },
            ]}
          >
            {saving ? (
              <ActivityIndicator color={colors.primaryForeground} />
            ) : (
              <Text style={[styles.saveBtnText, { color: colors.primaryForeground }]}>
                {saved ? t("companion.saved") : t("common.save")}
              </Text>
            )}
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
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
  content: {
    paddingHorizontal: 20,
    paddingTop: 24,
    gap: 28,
  },
  section: {
    gap: 10,
  },
  sectionLabel: {
    fontSize: 11,
    fontFamily: FONTS.semibold,
    letterSpacing: 0.7,
    textTransform: "uppercase",
  },
  input: {
    fontSize: 16,
    fontFamily: FONTS.regular,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 14,
    borderWidth: 1,
  },
  textarea: {
    fontSize: 15,
    fontFamily: FONTS.regular,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 14,
    borderWidth: 1,
    minHeight: 110,
    textAlignVertical: "top",
  },
  hint: {
    fontSize: 12,
    fontFamily: FONTS.regular,
    marginTop: 2,
  },
  toneList: {
    gap: 8,
  },
  toneOption: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderRadius: 16,
    paddingVertical: 12,
    paddingHorizontal: 14,
  },
  toneIcon: {
    marginRight: 12,
  },
  toneText: {
    flex: 1,
  },
  toneLabel: {
    fontSize: 15,
    fontFamily: FONTS.semibold,
    letterSpacing: -0.2,
  },
  toneDesc: {
    fontSize: 12.5,
    fontFamily: FONTS.regular,
    marginTop: 2,
  },
  linkRow: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderRadius: 16,
    paddingVertical: 12,
    paddingHorizontal: 14,
  },
  linkIcon: {
    marginRight: 12,
  },
  linkText: {
    flex: 1,
  },
  linkLabel: {
    fontSize: 15,
    fontFamily: FONTS.semibold,
    letterSpacing: -0.2,
  },
  linkDesc: {
    fontSize: 12.5,
    fontFamily: FONTS.regular,
    marginTop: 2,
  },
  checkPlaceholder: {
    width: 18,
    height: 18,
  },
  saveBtn: {
    borderRadius: 18,
    paddingVertical: 14,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 4,
  },
  saveBtnText: {
    fontSize: 16,
    fontFamily: FONTS.semibold,
  },
});
