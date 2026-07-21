import React from "react";
import {
  Alert,
  Image,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useColors } from "@/hooks/useColors";
import { useAuth } from "@/lib/auth";

export default function ProfileScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user, logout, deleteAccount } = useAuth();

  const handleBack = () => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace("/");
    }
  };

  const fullName =
    [user?.firstName, user?.lastName]
      .map((p) => p?.trim())
      .filter(Boolean)
      .join(" ") || null;
  const email = user?.email?.trim() || null;
  const initial = (fullName || email || "?").charAt(0).toUpperCase();

  const handleLogout = async () => {
    await logout();
  };

  const handleDeleteAccount = () => {
    Alert.alert(
      "Delete account?",
      "This permanently deletes your account, profile, and all your conversations. This can't be undone.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: () => {
            deleteAccount().catch(() => {
              Alert.alert(
                "Couldn't delete account",
                "Something went wrong while deleting your account. Please try again.",
              );
            });
          },
        },
      ],
    );
  };

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      <View
        style={[
          styles.header,
          { paddingTop: insets.top + 8, borderBottomColor: colors.border },
        ]}
      >
        <TouchableOpacity
          onPress={handleBack}
          style={styles.backBtn}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
        >
          <Feather name="chevron-left" size={24} color={colors.foreground} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.foreground }]}>
          Profile
        </Text>
        <View style={styles.backBtn} />
      </View>

      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingBottom: insets.bottom + 32 },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.identity}>
          {user?.profileImageUrl ? (
            <Image
              source={{ uri: user.profileImageUrl }}
              style={[styles.avatar, { backgroundColor: colors.muted }]}
            />
          ) : (
            <View
              style={[
                styles.avatar,
                styles.avatarFallback,
                { backgroundColor: colors.muted, borderColor: colors.primary },
              ]}
            >
              <Text style={[styles.avatarInitial, { color: colors.primary }]}>
                {initial}
              </Text>
            </View>
          )}
          <Text style={[styles.name, { color: colors.foreground }]}>
            {fullName || "Empiri user"}
          </Text>
          {email && (
            <Text style={[styles.emailSubtitle, { color: colors.mutedForeground }]}>
              {email}
            </Text>
          )}
        </View>

        <View
          style={[
            styles.card,
            { backgroundColor: colors.card, borderColor: colors.border },
          ]}
        >
          <Text style={[styles.cardLabel, { color: colors.mutedForeground }]}>
            Full name
          </Text>
          <Text style={[styles.cardValue, { color: colors.foreground }]}>
            {fullName || "Not provided"}
          </Text>

          <View style={[styles.divider, { backgroundColor: colors.border }]} />

          <Text style={[styles.cardLabel, { color: colors.mutedForeground }]}>
            Email
          </Text>
          <Text style={[styles.cardValue, { color: colors.foreground }]}>
            {email || "Not provided"}
          </Text>
        </View>

        <TouchableOpacity
          onPress={() => router.push("/companion-settings")}
          activeOpacity={0.85}
          style={[
            styles.linkRow,
            { backgroundColor: colors.card, borderColor: colors.border },
          ]}
        >
          <View style={styles.linkIcon}>
            <Feather name="heart" size={20} color={colors.primary} />
          </View>
          <View style={styles.linkText}>
            <Text style={[styles.linkTitle, { color: colors.foreground }]}>
              Companion settings
            </Text>
            <Text
              style={[styles.linkSubtitle, { color: colors.mutedForeground }]}
            >
              Name and personalize your companion
            </Text>
          </View>
          <Feather
            name="chevron-right"
            size={20}
            color={colors.mutedForeground}
          />
        </TouchableOpacity>

        <View style={styles.actions}>
          <TouchableOpacity
            onPress={handleLogout}
            activeOpacity={0.85}
            style={[styles.logoutBtn, { borderColor: colors.border }]}
          >
            <Feather name="log-out" size={18} color={colors.foreground} />
            <Text style={[styles.logoutText, { color: colors.foreground }]}>
              Sign out
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={handleDeleteAccount}
            activeOpacity={0.85}
            style={styles.deleteBtn}
            accessibilityRole="button"
            accessibilityLabel="Delete account"
          >
            <Feather name="trash-2" size={16} color={colors.destructive} />
            <Text style={[styles.deleteText, { color: colors.destructive }]}>
              Delete account
            </Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 12,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  backBtn: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: "700",
  },
  content: {
    paddingHorizontal: 24,
    paddingTop: 32,
    gap: 28,
  },
  identity: {
    alignItems: "center",
    gap: 12,
  },
  avatar: {
    width: 104,
    height: 104,
    borderRadius: 52,
  },
  avatarFallback: {
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
  },
  avatarInitial: {
    fontSize: 40,
    fontWeight: "700",
  },
  name: {
    fontSize: 24,
    fontWeight: "700",
    textAlign: "center",
  },
  emailSubtitle: {
    fontSize: 14,
    textAlign: "center",
  },
  card: {
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 18,
    gap: 6,
  },
  cardLabel: {
    fontSize: 12,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  cardValue: {
    fontSize: 16,
    fontWeight: "500",
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    marginVertical: 14,
  },
  linkRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 16,
  },
  linkIcon: {
    width: 24,
    alignItems: "center",
  },
  linkText: {
    flex: 1,
    gap: 3,
  },
  linkTitle: {
    fontSize: 16,
    fontWeight: "600",
  },
  linkSubtitle: {
    fontSize: 13,
  },
  logoutBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    height: 52,
    borderRadius: 16,
    borderWidth: 1,
  },
  logoutText: {
    fontSize: 16,
    fontWeight: "600",
  },
  actions: {
    gap: 8,
  },
  deleteBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    height: 48,
  },
  deleteText: {
    fontSize: 14,
    fontWeight: "600",
  },
});
