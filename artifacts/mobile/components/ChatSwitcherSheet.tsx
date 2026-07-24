import { Feather } from "@expo/vector-icons";
import type { Conversation } from "@workspace/api-client-react";
import * as Haptics from "expo-haptics";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
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
import { t } from "@/lib/i18n";

interface ChatSwitcherSheetProps {
  visible: boolean;
  /** The user's conversations, oldest first (rendered newest first). */
  chats: Conversation[];
  /** The currently open conversation. */
  activeId: number | null;
  /** Open another conversation. Rejects on failure. */
  onSelect: (id: number) => Promise<void>;
  /** Create a fresh conversation and open it. Rejects on failure. */
  onNewChat: () => Promise<void>;
  /** Rename the currently open conversation (opens the rename dialog). */
  onRenameActive: () => void;
  /**
   * Delete a conversation by id. The sheet shows a native confirmation alert
   * before calling this. Rejects on failure.
   */
  onDeleteChat: (id: number) => Promise<void>;
  /** Refresh the list from the server (best-effort, fire-and-forget). */
  onRefresh: () => void;
  onClose: () => void;
  /** Personality-derived accent; falls back to the static token. */
  accent?: string;
}

/** Returns a short relative label: "just now", "3m ago", "2h ago", "5d ago". */
function formatRelativeTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const diffMs = Date.now() - d.getTime();
  const mins = Math.floor(diffMs / 60_000);
  if (mins < 1) return t("switcher.time.justNow");
  if (mins < 60) return t("switcher.time.minutes", { mins });
  const hours = Math.floor(mins / 60);
  if (hours < 24) return t("switcher.time.hours", { hours });
  const days = Math.floor(hours / 24);
  if (days < 7) return t("switcher.time.days", { days });
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

/** Truncate a string to maxLen characters, appending "…" if trimmed. */
function truncate(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text;
  return text.slice(0, maxLen - 1) + "…";
}

/** One-line subtitle for a chat row based on its last message preview. */
function formatPreview(chat: Conversation, active: boolean): string {
  if (active) return t("switcher.currentChat");
  if (!chat.lastMessageText) return t("switcher.noMessages");
  const preview = truncate(chat.lastMessageText.replace(/\n+/g, " "), 60);
  const timeLabel = chat.lastMessageAt ? formatRelativeTime(chat.lastMessageAt) : "";
  return timeLabel ? `${timeLabel} · ${preview}` : preview;
}

export function ChatSwitcherSheet({
  visible,
  chats,
  activeId,
  onSelect,
  onNewChat,
  onRenameActive,
  onDeleteChat,
  onRefresh,
  onClose,
  accent,
}: ChatSwitcherSheetProps) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const tint = accent ?? colors.statusAccent;

  // id currently being opened, or -1 while creating a new chat.
  const [busyId, setBusyId] = useState<number | null>(null);
  const [sheetError, setSheetError] = useState<string | null>(null);

  // Refresh the list every time the sheet opens so titles/new chats from
  // other devices show up; also clear any stale error/busy state.
  useEffect(() => {
    if (visible) {
      setBusyId(null);
      setSheetError(null);
      onRefresh();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  const haptic = () => {
    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    }
  };

  const handleOpen = async (id: number) => {
    if (busyId != null) return;
    haptic();
    if (id === activeId) {
      onClose();
      return;
    }
    setBusyId(id);
    setSheetError(null);
    try {
      await onSelect(id);
      onClose();
    } catch {
      setSheetError(t("switcher.openFailed"));
    } finally {
      setBusyId(null);
    }
  };

  const handleNewChat = async () => {
    if (busyId != null) return;
    haptic();
    setBusyId(-1);
    setSheetError(null);
    try {
      await onNewChat();
      onClose();
    } catch {
      setSheetError(t("switcher.createFailed"));
    } finally {
      setBusyId(null);
    }
  };

  const handleDeletePress = (id: number, title: string) => {
    haptic();
    Alert.alert(
      t("switcher.deleteTitle"),
      t("switcher.deleteMessage", { title }),
      [
        { text: t("common.cancel"), style: "cancel" },
        {
          text: t("common.delete"),
          style: "destructive",
          onPress: () => void handleDeleteConfirmed(id),
        },
      ],
    );
  };

  const handleDeleteConfirmed = async (id: number) => {
    if (busyId != null) return;
    setBusyId(id);
    setSheetError(null);
    try {
      await onDeleteChat(id);
      // If we deleted the active chat the context switches automatically;
      // close the sheet so the user lands in the new active chat.
      if (id === activeId) onClose();
    } catch {
      setSheetError(t("switcher.deleteFailed"));
    } finally {
      setBusyId(null);
    }
  };

  // Newest chats first — the most recent conversation is what people
  // usually want to jump back into.
  const ordered = [...chats].reverse();

  return (
    <Modal
      visible={visible}
      animationType="fade"
      transparent
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <View style={styles.overlay} testID="chat-switcher-sheet">
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel={t("a11y.closeChatList")}
        />
        <View
          style={[
            styles.sheet,
            {
              backgroundColor: colors.background,
              borderColor: colors.glassBorder,
              paddingBottom: Math.max(insets.bottom, 16) + 4,
            },
          ]}
        >
          <View style={[styles.handle, { backgroundColor: colors.glassBorder }]} />

          <View style={styles.headerRow}>
            <Text style={[styles.title, { color: colors.foreground }]}>{t("switcher.title")}</Text>
            <Pressable
              onPress={handleNewChat}
              disabled={busyId != null}
              accessibilityRole="button"
              accessibilityLabel={t("a11y.startNewChat")}
              testID="new-chat-button"
              style={({ pressed }) => [
                styles.newChatBtn,
                {
                  backgroundColor: `${tint}22`,
                  borderColor: `${tint}55`,
                  opacity: pressed || busyId != null ? 0.6 : 1,
                },
              ]}
            >
              {busyId === -1 ? (
                <ActivityIndicator size="small" color={tint} />
              ) : (
                <Feather name="plus" size={15} color={tint} />
              )}
              <Text style={[styles.newChatText, { color: tint }]}>{t("switcher.newChat")}</Text>
            </Pressable>
          </View>

          {sheetError ? (
            <Text style={[styles.errorText, { color: colors.destructive }]}>
              {sheetError}
            </Text>
          ) : null}

          <FlatList
            data={ordered}
            keyExtractor={(item) => String(item.id)}
            style={styles.list}
            contentContainerStyle={styles.listContent}
            showsVerticalScrollIndicator={false}
            renderItem={({ item }) => {
              const active = item.id === activeId;
              const isBusy = busyId === item.id;
              return (
                <Pressable
                  onPress={() => handleOpen(item.id)}
                  disabled={busyId != null}
                  accessibilityRole="button"
                  accessibilityLabel={
                    active
                      ? t("a11y.currentChatRow", { title: item.title })
                      : t("a11y.openChat", { title: item.title })
                  }
                  testID={`chat-row-${item.id}`}
                  style={({ pressed }) => [
                    styles.row,
                    {
                      backgroundColor: active ? `${tint}14` : colors.glass,
                      borderColor: active ? `${tint}55` : colors.glassBorder,
                      opacity: pressed ? 0.7 : 1,
                    },
                  ]}
                >
                  <View
                    style={[
                      styles.rowIcon,
                      { backgroundColor: active ? `${tint}22` : "transparent" },
                    ]}
                  >
                    <Feather
                      name="message-circle"
                      size={16}
                      color={active ? tint : colors.mutedForeground}
                    />
                  </View>
                  <View style={styles.rowBody}>
                    <Text
                      style={[
                        styles.rowTitle,
                        { color: active ? tint : colors.foreground },
                      ]}
                      numberOfLines={1}
                    >
                      {item.title}
                    </Text>
                    <Text
                      style={[styles.rowSub, { color: colors.mutedForeground }]}
                      numberOfLines={1}
                    >
                      {formatPreview(item, active)}
                    </Text>
                  </View>

                  {isBusy ? (
                    <ActivityIndicator size="small" color={tint} />
                  ) : (
                    <View style={styles.rowActions}>
                      {active ? (
                        <Pressable
                          onPress={() => {
                            haptic();
                            onRenameActive();
                          }}
                          hitSlop={8}
                          accessibilityRole="button"
                          accessibilityLabel={t("a11y.renameChat")}
                          testID="switcher-rename-button"
                          style={({ pressed }) => ({ opacity: pressed ? 0.5 : 1 })}
                        >
                          <Feather name="edit-2" size={15} color={tint} />
                        </Pressable>
                      ) : null}
                      <Pressable
                        onPress={(e) => {
                          e.stopPropagation();
                          handleDeletePress(item.id, item.title);
                        }}
                        hitSlop={8}
                        disabled={busyId != null}
                        accessibilityRole="button"
                        accessibilityLabel={t("a11y.deleteChat", { title: item.title })}
                        testID={`delete-chat-${item.id}`}
                        style={({ pressed }) => ({
                          opacity: pressed || busyId != null ? 0.4 : 0.6,
                        })}
                      >
                        <Feather name="trash-2" size={15} color={colors.destructive} />
                      </Pressable>
                    </View>
                  )}
                </Pressable>
              );
            }}
            ListEmptyComponent={
              <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>
                {t("switcher.empty")}
              </Text>
            }
          />
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
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderWidth: 1,
    paddingHorizontal: 18,
    paddingTop: 10,
    maxHeight: "72%",
  },
  handle: {
    alignSelf: "center",
    width: 38,
    height: 4,
    borderRadius: 2,
    marginBottom: 12,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  title: {
    fontSize: 18,
    fontFamily: FONTS.bold,
    letterSpacing: -0.3,
  },
  newChatBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderRadius: 16,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  newChatText: {
    fontSize: 13,
    fontFamily: FONTS.semibold,
  },
  errorText: {
    fontSize: 13,
    fontFamily: FONTS.regular,
    marginBottom: 8,
  },
  list: {
    flexGrow: 0,
  },
  listContent: {
    gap: 8,
    paddingBottom: 8,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderRadius: 14,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 11,
  },
  rowIcon: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
  },
  rowBody: {
    flex: 1,
    gap: 1,
  },
  rowTitle: {
    fontSize: 15,
    fontFamily: FONTS.semibold,
  },
  rowSub: {
    fontSize: 12,
    fontFamily: FONTS.regular,
  },
  rowActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
  },
  emptyText: {
    fontSize: 14,
    fontFamily: FONTS.regular,
    textAlign: "center",
    paddingVertical: 20,
  },
});
