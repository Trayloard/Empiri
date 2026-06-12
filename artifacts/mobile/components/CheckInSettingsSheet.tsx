import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import React from "react";
import {
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { FONTS } from "@/constants/fonts";
import { useColors } from "@/hooks/useColors";
import type { CheckInCadence } from "@/lib/mood";

interface CheckInSettingsSheetProps {
  visible: boolean;
  cadence: CheckInCadence;
  onSelect: (cadence: CheckInCadence) => void;
  onClose: () => void;
}

interface CadenceOption {
  value: CheckInCadence;
  label: string;
  description: string;
  icon: keyof typeof Feather.glyphMap;
}

// Presented in the task's order: Off → Daily → A few times a day. Copy stays in
// English (the app's UI language).
const OPTIONS: CadenceOption[] = [
  {
    value: "off",
    label: "Off",
    description: "Empiri waits for you to say hi first.",
    icon: "moon",
  },
  {
    value: "daily",
    label: "Once a day",
    description: "A gentle check-in after a quiet day.",
    icon: "sunrise",
  },
  {
    value: "frequent",
    label: "A few times a day",
    description: "Empiri reaches out when it's been a few hours.",
    icon: "sun",
  },
];

export function CheckInSettingsSheet({
  visible,
  cadence,
  onSelect,
  onClose,
}: CheckInSettingsSheetProps) {
  const colors = useColors();
  const insets = useSafeAreaInsets();

  const handleSelect = (next: CheckInCadence) => {
    if (Platform.OS !== "web") {
      Haptics.selectionAsync().catch(() => {});
    }
    onSelect(next);
  };

  return (
    <Modal
      visible={visible}
      animationType="fade"
      transparent
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <View style={styles.overlay} testID="check-in-settings-sheet">
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel="Close check-in settings"
        />

        <View
          style={[
            styles.sheet,
            {
              backgroundColor: colors.background,
              borderColor: colors.glassBorder,
              paddingBottom: insets.bottom + 20,
            },
          ]}
        >
          <View style={[styles.grabber, { backgroundColor: colors.border }]} />

          <View style={styles.header}>
            <View style={styles.headerText}>
              <Text style={[styles.title, { color: colors.foreground }]}>
                Check-ins
              </Text>
              <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>
                How often should Empiri reach out?
              </Text>
            </View>
            <Pressable
              onPress={onClose}
              testID="check-in-settings-close"
              accessibilityRole="button"
              accessibilityLabel="Done"
              hitSlop={12}
              style={({ pressed }) => [
                styles.closeBtn,
                {
                  backgroundColor: colors.muted,
                  opacity: pressed ? 0.6 : 1,
                },
              ]}
            >
              <Feather name="x" size={18} color={colors.foreground} />
            </Pressable>
          </View>

          <View style={styles.options}>
            {OPTIONS.map((opt) => {
              const active = opt.value === cadence;
              return (
                <Pressable
                  key={opt.value}
                  onPress={() => handleSelect(opt.value)}
                  testID={`cadence-option-${opt.value}`}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: active }}
                  accessibilityLabel={`${opt.label}. ${opt.description}`}
                  style={({ pressed }) => [
                    styles.option,
                    {
                      borderColor: active ? colors.statusAccent : colors.border,
                      backgroundColor: active ? colors.muted : "transparent",
                      opacity: pressed ? 0.7 : 1,
                    },
                  ]}
                >
                  <Feather
                    name={opt.icon}
                    size={20}
                    color={active ? colors.statusAccent : colors.mutedForeground}
                    style={styles.optionIcon}
                  />
                  <View style={styles.optionText}>
                    <Text
                      style={[styles.optionLabel, { color: colors.foreground }]}
                    >
                      {opt.label}
                    </Text>
                    <Text
                      style={[
                        styles.optionDesc,
                        { color: colors.mutedForeground },
                      ]}
                    >
                      {opt.description}
                    </Text>
                  </View>
                  {active ? (
                    <Feather
                      name="check"
                      size={20}
                      color={colors.statusAccent}
                      testID={`cadence-selected-${opt.value}`}
                    />
                  ) : (
                    <View style={styles.checkPlaceholder} />
                  )}
                </Pressable>
              );
            })}
          </View>

          <Text style={[styles.footnote, { color: colors.mutedForeground }]}>
            Turning check-ins off also pauses notifications.
          </Text>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "rgba(0,0,0,0.45)",
  },
  sheet: {
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    borderWidth: 1,
    paddingTop: 10,
    paddingHorizontal: 20,
  },
  grabber: {
    alignSelf: "center",
    width: 40,
    height: 4,
    borderRadius: 2,
    marginBottom: 14,
  },
  header: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    marginBottom: 18,
  },
  headerText: {
    flex: 1,
    paddingRight: 12,
  },
  title: {
    fontSize: 22,
    fontFamily: FONTS.bold,
    letterSpacing: -0.4,
  },
  subtitle: {
    fontSize: 14,
    fontFamily: FONTS.regular,
    marginTop: 3,
  },
  closeBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
  },
  options: {
    gap: 10,
  },
  option: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderRadius: 18,
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  optionIcon: {
    marginRight: 14,
  },
  optionText: {
    flex: 1,
  },
  optionLabel: {
    fontSize: 16,
    fontFamily: FONTS.semibold,
    letterSpacing: -0.2,
  },
  optionDesc: {
    fontSize: 13,
    fontFamily: FONTS.regular,
    marginTop: 2,
  },
  checkPlaceholder: {
    width: 20,
    height: 20,
  },
  footnote: {
    fontSize: 12,
    fontFamily: FONTS.regular,
    textAlign: "center",
    marginTop: 16,
  },
});
