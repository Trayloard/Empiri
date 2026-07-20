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
import { DEV_NUDGE_SECONDS } from "@/lib/notifications";
import {
  formatQuietTime,
  stepQuietTime,
  type QuietHours,
} from "@/lib/quietHours";

interface CheckInSettingsSheetProps {
  visible: boolean;
  cadence: CheckInCadence;
  onSelect: (cadence: CheckInCadence) => void;
  onClose: () => void;
  /** The do-not-disturb window for proactive check-ins. */
  quietHours?: QuietHours;
  /** Persist a change to the quiet-hours window. */
  onQuietHoursChange?: (next: QuietHours) => void;
  /** Whether the opt-in device senses (motion, battery, time of day) are on. */
  sensesEnabled?: boolean;
  /** Flip the senses opt-in. */
  onSensesToggle?: () => void;
  /** Personality-derived accent; falls back to the static token. */
  accent?: string;
  /** Navigate to the companion personalisation screen. */
  onPersonalize?: () => void;
  /** Sign out of the current account. */
  onSignOut?: () => void;
  /** DEV-only: fire a check-in greeting immediately (QA shortcut). */
  onDevCheckIn?: () => void;
  /** DEV-only: schedule a notification nudge a few seconds out (QA shortcut). */
  onDevNudge?: () => void;
  /** DEV-only: roll Empiri's inner self back a few steps (QA shortcut). */
  onDevRegress?: () => void;
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
  quietHours,
  onQuietHoursChange,
  sensesEnabled,
  onSensesToggle,
  accent,
  onPersonalize,
  onSignOut,
  onDevCheckIn,
  onDevNudge,
  onDevRegress,
}: CheckInSettingsSheetProps) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const tint = accent ?? colors.statusAccent;

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
                      borderColor: active ? tint : colors.border,
                      backgroundColor: active ? colors.muted : "transparent",
                      opacity: pressed ? 0.7 : 1,
                    },
                  ]}
                >
                  <Feather
                    name={opt.icon}
                    size={20}
                    color={active ? tint : colors.mutedForeground}
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
                      color={tint}
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

          {quietHours && onQuietHoursChange && (
            <View
              style={[styles.quietSection, { borderColor: colors.border }]}
              testID="quiet-hours-section"
            >
              <Pressable
                onPress={() => {
                  if (Platform.OS !== "web") {
                    Haptics.selectionAsync().catch(() => {});
                  }
                  onQuietHoursChange({
                    ...quietHours,
                    enabled: !quietHours.enabled,
                  });
                }}
                testID="quiet-hours-toggle"
                accessibilityRole="switch"
                accessibilityState={{ checked: quietHours.enabled }}
                accessibilityLabel="Quiet hours"
                style={({ pressed }) => [
                  styles.quietHeader,
                  { opacity: pressed ? 0.7 : 1 },
                ]}
              >
                <Feather
                  name="moon"
                  size={18}
                  color={quietHours.enabled ? tint : colors.mutedForeground}
                  style={{ marginRight: 12 }}
                />
                <View style={{ flex: 1 }}>
                  <Text
                    style={[styles.quietTitle, { color: colors.foreground }]}
                  >
                    Quiet hours
                  </Text>
                  <Text
                    style={[styles.quietDesc, { color: colors.mutedForeground }]}
                  >
                    {quietHours.enabled
                      ? `No check-ins ${formatQuietTime(quietHours.startMinutes)} – ${formatQuietTime(quietHours.endMinutes)}`
                      : "Silence check-ins during set hours."}
                  </Text>
                </View>
                <View
                  style={[
                    styles.quietSwitch,
                    {
                      backgroundColor: quietHours.enabled
                        ? tint
                        : colors.muted,
                    },
                  ]}
                >
                  <View
                    style={[
                      styles.quietSwitchKnob,
                      {
                        backgroundColor: colors.background,
                        alignSelf: quietHours.enabled
                          ? "flex-end"
                          : "flex-start",
                      },
                    ]}
                  />
                </View>
              </Pressable>

              {quietHours.enabled && (
                <View style={styles.quietTimes}>
                  {(
                    [
                      { key: "startMinutes", label: "From" },
                      { key: "endMinutes", label: "Until" },
                    ] as const
                  ).map(({ key, label }) => (
                    <View
                      key={key}
                      style={[styles.quietTimeRow, { borderColor: colors.border }]}
                    >
                      <Text
                        style={[
                          styles.quietTimeLabel,
                          { color: colors.mutedForeground },
                        ]}
                      >
                        {label}
                      </Text>
                      <View style={styles.quietStepper}>
                        <Pressable
                          onPress={() =>
                            onQuietHoursChange({
                              ...quietHours,
                              [key]: stepQuietTime(quietHours[key], -1),
                            })
                          }
                          testID={`quiet-${key}-minus`}
                          accessibilityRole="button"
                          accessibilityLabel={`Earlier ${label.toLowerCase()} time`}
                          hitSlop={8}
                          style={({ pressed }) => [
                            styles.quietStepBtn,
                            {
                              backgroundColor: colors.muted,
                              opacity: pressed ? 0.6 : 1,
                            },
                          ]}
                        >
                          <Feather
                            name="minus"
                            size={15}
                            color={colors.foreground}
                          />
                        </Pressable>
                        <Text
                          style={[
                            styles.quietTimeValue,
                            { color: colors.foreground },
                          ]}
                          testID={`quiet-${key}-value`}
                        >
                          {formatQuietTime(quietHours[key])}
                        </Text>
                        <Pressable
                          onPress={() =>
                            onQuietHoursChange({
                              ...quietHours,
                              [key]: stepQuietTime(quietHours[key], 1),
                            })
                          }
                          testID={`quiet-${key}-plus`}
                          accessibilityRole="button"
                          accessibilityLabel={`Later ${label.toLowerCase()} time`}
                          hitSlop={8}
                          style={({ pressed }) => [
                            styles.quietStepBtn,
                            {
                              backgroundColor: colors.muted,
                              opacity: pressed ? 0.6 : 1,
                            },
                          ]}
                        >
                          <Feather
                            name="plus"
                            size={15}
                            color={colors.foreground}
                          />
                        </Pressable>
                      </View>
                    </View>
                  ))}
                </View>
              )}
            </View>
          )}

          {onSensesToggle && (
            <View
              style={[styles.quietSection, { borderColor: colors.border }]}
              testID="senses-section"
            >
              <Pressable
                onPress={() => {
                  if (Platform.OS !== "web") {
                    Haptics.selectionAsync().catch(() => {});
                  }
                  onSensesToggle();
                }}
                testID="senses-toggle"
                accessibilityRole="switch"
                accessibilityState={{ checked: !!sensesEnabled }}
                accessibilityLabel="Senses"
                style={({ pressed }) => [
                  styles.quietHeader,
                  { opacity: pressed ? 0.7 : 1 },
                ]}
              >
                <Feather
                  name="activity"
                  size={18}
                  color={sensesEnabled ? tint : colors.mutedForeground}
                  style={{ marginRight: 12 }}
                />
                <View style={{ flex: 1 }}>
                  <Text
                    style={[styles.quietTitle, { color: colors.foreground }]}
                  >
                    Senses
                  </Text>
                  <Text
                    style={[styles.quietDesc, { color: colors.mutedForeground }]}
                  >
                    {sensesEnabled
                      ? "Empiri notices little things — a shake, charging, the time of day — while the app is open."
                      : "Let Empiri gently notice motion, charging, and the time of day."}
                  </Text>
                </View>
                <View
                  style={[
                    styles.quietSwitch,
                    {
                      backgroundColor: sensesEnabled ? tint : colors.muted,
                    },
                  ]}
                >
                  <View
                    style={[
                      styles.quietSwitchKnob,
                      {
                        backgroundColor: colors.background,
                        alignSelf: sensesEnabled ? "flex-end" : "flex-start",
                      },
                    ]}
                  />
                </View>
              </Pressable>
            </View>
          )}

          {onPersonalize && (
            <Pressable
              onPress={onPersonalize}
              accessibilityRole="button"
              accessibilityLabel="Personalize your companion"
              style={({ pressed }) => [
                styles.personalizeRow,
                {
                  borderColor: colors.border,
                  backgroundColor: pressed ? colors.muted : "transparent",
                },
              ]}
            >
              <Feather name="sliders" size={16} color={tint} style={{ marginRight: 10 }} />
              <Text style={[styles.personalizeLabel, { color: colors.foreground }]}>
                Personalize your companion
              </Text>
              <Feather name="chevron-right" size={16} color={colors.mutedForeground} />
            </Pressable>
          )}

          {onSignOut && (
            <Pressable
              onPress={onSignOut}
              testID="sign-out-button"
              accessibilityRole="button"
              accessibilityLabel="Sign out"
              style={({ pressed }) => [
                styles.personalizeRow,
                {
                  borderColor: colors.border,
                  backgroundColor: pressed ? colors.muted : "transparent",
                },
              ]}
            >
              <Feather
                name="log-out"
                size={16}
                color={colors.destructive}
                style={{ marginRight: 10 }}
              />
              <Text style={[styles.personalizeLabel, { color: colors.destructive }]}>
                Sign out
              </Text>
              <Feather name="chevron-right" size={16} color={colors.mutedForeground} />
            </Pressable>
          )}

          {__DEV__ ? (
            <View
              style={[styles.devSection, { borderTopColor: colors.border }]}
              testID="dev-tools-section"
            >
              <Text style={[styles.devLabel, { color: colors.mutedForeground }]}>
                Dev tools
              </Text>
              <View style={styles.devButtons}>
                <Pressable
                  onPress={onDevCheckIn}
                  disabled={!onDevCheckIn}
                  testID="dev-trigger-checkin"
                  accessibilityRole="button"
                  accessibilityLabel="Trigger a check-in now"
                  style={({ pressed }) => [
                    styles.devButton,
                    {
                      borderColor: colors.border,
                      opacity: !onDevCheckIn ? 0.4 : pressed ? 0.7 : 1,
                    },
                  ]}
                >
                  <Feather name="zap" size={15} color={tint} />
                  <Text
                    style={[styles.devButtonText, { color: colors.foreground }]}
                  >
                    Check in now
                  </Text>
                </Pressable>
                <Pressable
                  onPress={onDevNudge}
                  disabled={!onDevNudge}
                  testID="dev-trigger-nudge"
                  accessibilityRole="button"
                  accessibilityLabel="Schedule a nudge in a few seconds"
                  style={({ pressed }) => [
                    styles.devButton,
                    {
                      borderColor: colors.border,
                      opacity: !onDevNudge ? 0.4 : pressed ? 0.7 : 1,
                    },
                  ]}
                >
                  <Feather name="bell" size={15} color={tint} />
                  <Text
                    style={[styles.devButtonText, { color: colors.foreground }]}
                  >
                    Nudge in {DEV_NUDGE_SECONDS}s
                  </Text>
                </Pressable>
                <Pressable
                  onPress={onDevRegress}
                  disabled={!onDevRegress}
                  testID="dev-trigger-regress"
                  accessibilityRole="button"
                  accessibilityLabel="Wind Empiri back a few steps"
                  style={({ pressed }) => [
                    styles.devButton,
                    {
                      borderColor: colors.border,
                      opacity: !onDevRegress ? 0.4 : pressed ? 0.7 : 1,
                    },
                  ]}
                >
                  <Feather name="rewind" size={15} color={tint} />
                  <Text
                    style={[styles.devButtonText, { color: colors.foreground }]}
                  >
                    Wind back
                  </Text>
                </Pressable>
              </View>
            </View>
          ) : null}
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
  quietSection: {
    borderWidth: 1,
    borderRadius: 18,
    paddingVertical: 12,
    paddingHorizontal: 14,
    marginTop: 14,
  },
  quietHeader: {
    flexDirection: "row",
    alignItems: "center",
  },
  quietTitle: {
    fontSize: 15,
    fontFamily: FONTS.semibold,
    letterSpacing: -0.2,
  },
  quietDesc: {
    fontSize: 12.5,
    fontFamily: FONTS.regular,
    marginTop: 2,
  },
  quietSwitch: {
    width: 44,
    height: 26,
    borderRadius: 13,
    padding: 3,
    marginLeft: 10,
    justifyContent: "center",
  },
  quietSwitchKnob: {
    width: 20,
    height: 20,
    borderRadius: 10,
  },
  quietTimes: {
    marginTop: 12,
    gap: 8,
  },
  quietTimeRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderWidth: 1,
    borderRadius: 14,
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  quietTimeLabel: {
    fontSize: 13,
    fontFamily: FONTS.medium,
  },
  quietStepper: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  quietStepBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  quietTimeValue: {
    fontSize: 14,
    fontFamily: FONTS.semibold,
    minWidth: 76,
    textAlign: "center",
  },
  devSection: {
    marginTop: 18,
    paddingTop: 14,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  devLabel: {
    fontSize: 11,
    fontFamily: FONTS.semibold,
    letterSpacing: 0.8,
    textTransform: "uppercase",
    marginBottom: 10,
  },
  devButtons: {
    flexDirection: "row",
    gap: 10,
  },
  personalizeRow: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 14,
    marginTop: 8,
  },
  personalizeLabel: {
    flex: 1,
    fontSize: 14,
    fontFamily: FONTS.medium,
  },
  devButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
    borderWidth: 1,
    borderRadius: 14,
    paddingVertical: 11,
    paddingHorizontal: 12,
  },
  devButtonText: {
    fontSize: 13.5,
    fontFamily: FONTS.semibold,
  },
});
