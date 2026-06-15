import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
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

const TONE_OPTIONS = [
  {
    value: "calm" as const,
    label: "Calm",
    description: "Gentle, steady, and warm.",
    icon: "cloud" as const,
  },
  {
    value: "playful" as const,
    label: "Playful",
    description: "Lighthearted, fun, and full of wordplay.",
    icon: "smile" as const,
  },
  {
    value: "witty" as const,
    label: "Witty",
    description: "Clever and a little sharp.",
    icon: "zap" as const,
  },
  {
    value: "wise" as const,
    label: "Wise",
    description: "Thoughtful, reflective, and a bit philosophical.",
    icon: "book-open" as const,
  },
  {
    value: "cheerful" as const,
    label: "Cheerful",
    description: "Bright, uplifting, and encouraging.",
    icon: "sun" as const,
  },
];

type ToneValue = (typeof TONE_OPTIONS)[number]["value"];

export default function CompanionSettingsScreen() {
  const router = useRouter();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { settings, saveSettings } = useCompanion();

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
          Personalize
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
              Name your companion
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
              This name appears in the tooltip and is used by your companion.
            </Text>
          </View>

          {/* Tone */}
          <View style={styles.section}>
            <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>
              Conversation tone
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
                    accessibilityLabel={`${opt.label}. ${opt.description}`}
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
                        {opt.label}
                      </Text>
                      <Text
                        style={[
                          styles.toneDesc,
                          { color: colors.mutedForeground },
                        ]}
                      >
                        {opt.description}
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
              About you
            </Text>
            <TextInput
              value={note}
              onChangeText={setNote}
              placeholder="What should your companion know about you?"
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

          {/* Save button */}
          <Pressable
            onPress={handleSave}
            disabled={saving}
            accessibilityRole="button"
            accessibilityLabel="Save companion settings"
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
                {saved ? "Saved ✓" : "Save"}
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
