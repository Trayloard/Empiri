import React, { useRef, useState } from "react";
import {
  FlatList,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ChatInput } from "@/components/ChatInput";
import { Creature } from "@/components/Creature";
import { DynamicIsland } from "@/components/DynamicIsland";
import { MessageBubble } from "@/components/MessageBubble";
import { useCompanion, Message } from "@/context/CompanionContext";
import { useColors } from "@/hooks/useColors";
import { useAuth } from "@/lib/auth";

export default function HomeScreen() {
  const {
    messages,
    conversations,
    activeConversationId,
    creatureState,
    companionName,
    isStreaming,
    sendMessage,
    switchConversation,
    newConversation,
    deleteActiveConversation,
  } = useCompanion();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { user, logout } = useAuth();
  const router = useRouter();
  const listRef = useRef<FlatList<Message>>(null);
  const [switcherOpen, setSwitcherOpen] = useState(false);

  const firstName = user?.firstName?.trim() || null;
  const initial = (firstName || user?.email || "?").charAt(0).toUpperCase();

  const handleSend = (text: string) => {
    sendMessage(text);
    setTimeout(() => {
      listRef.current?.scrollToEnd({ animated: true });
    }, 100);
  };

  const handleClear = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    deleteActiveConversation();
  };

  const handleNewChat = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSwitcherOpen(false);
    newConversation();
  };

  const handleSwitch = (id: number) => {
    Haptics.selectionAsync();
    setSwitcherOpen(false);
    switchConversation(id);
  };

  const renderEmpty = () => (
    <View style={styles.emptyContainer}>
      <Creature state={creatureState} size={200} />
      <Text style={[styles.emptyTitle, { color: colors.foreground }]}>
        Say hello to Empiri
      </Text>
      <Text style={[styles.emptySubtitle, { color: colors.mutedForeground }]}>
        Your AI companion lives in the Dynamic Island above.{"\n"}Tap it to start a conversation.
      </Text>
    </View>
  );

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      <DynamicIsland state={creatureState} companionName={companionName} />

      <View style={[styles.headerRow, { borderBottomColor: colors.border }]}>
        <TouchableOpacity
          style={styles.userInfo}
          onPress={() => router.push("/profile")}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel="Open profile"
        >
          {user?.profileImageUrl ? (
            <Image
              source={{ uri: user.profileImageUrl }}
              style={[styles.avatar, { backgroundColor: colors.muted }]}
            />
          ) : (
            <View style={[styles.avatar, styles.avatarFallback, { backgroundColor: colors.muted }]}>
              <Text style={[styles.avatarInitial, { color: colors.mutedForeground }]}>
                {initial}
              </Text>
            </View>
          )}
          <Text style={[styles.userName, { color: colors.foreground }]} numberOfLines={1}>
            {firstName ? `Hi, ${firstName}` : "Welcome"}
          </Text>
        </TouchableOpacity>
        <View style={styles.headerActions}>
          <TouchableOpacity
            onPress={() => setSwitcherOpen(true)}
            style={styles.iconBtn}
            disabled={isStreaming}
            accessibilityRole="button"
            accessibilityLabel="Switch conversation"
          >
            <Feather
              name="message-square"
              size={16}
              color={isStreaming ? colors.border : colors.mutedForeground}
            />
          </TouchableOpacity>
          <TouchableOpacity
            onPress={handleNewChat}
            style={styles.iconBtn}
            disabled={isStreaming}
            accessibilityRole="button"
            accessibilityLabel="New chat"
          >
            <Feather
              name="edit-3"
              size={16}
              color={isStreaming ? colors.border : colors.mutedForeground}
            />
          </TouchableOpacity>
          {messages.length > 0 && (
            <TouchableOpacity
              onPress={handleClear}
              style={styles.iconBtn}
              disabled={isStreaming}
              accessibilityRole="button"
              accessibilityLabel="Delete this chat"
            >
              <Feather
                name="trash-2"
                size={16}
                color={isStreaming ? colors.border : colors.mutedForeground}
              />
            </TouchableOpacity>
          )}
          <TouchableOpacity onPress={logout} style={styles.iconBtn}>
            <Feather name="log-out" size={16} color={colors.mutedForeground} />
          </TouchableOpacity>
        </View>
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        keyboardVerticalOffset={0}
      >
        <FlatList
          ref={listRef}
          data={messages}
          keyExtractor={(m) => m.id}
          renderItem={({ item }) => (
            <MessageBubble message={item} companionName={companionName} />
          )}
          ListEmptyComponent={renderEmpty}
          contentContainerStyle={[
            styles.list,
            messages.length === 0 && styles.listEmpty,
          ]}
          onContentSizeChange={() =>
            listRef.current?.scrollToEnd({ animated: true })
          }
          showsVerticalScrollIndicator={false}
        />
        <ChatInput onSend={handleSend} disabled={isStreaming} />
      </KeyboardAvoidingView>

      <Modal
        visible={switcherOpen}
        transparent
        animationType="slide"
        onRequestClose={() => setSwitcherOpen(false)}
      >
        <Pressable
          style={styles.modalOverlay}
          onPress={() => setSwitcherOpen(false)}
        >
          <Pressable
            style={[
              styles.sheet,
              { backgroundColor: colors.background, paddingBottom: insets.bottom + 16 },
            ]}
            onPress={(e) => e.stopPropagation()}
          >
            <View style={[styles.sheetHandle, { backgroundColor: colors.border }]} />
            <View style={styles.sheetHeader}>
              <Text style={[styles.sheetTitle, { color: colors.foreground }]}>
                Your chats
              </Text>
              <TouchableOpacity
                onPress={handleNewChat}
                style={[styles.newChatBtn, { backgroundColor: colors.foreground }]}
                disabled={isStreaming}
                accessibilityRole="button"
                accessibilityLabel="New chat"
              >
                <Feather name="plus" size={16} color={colors.background} />
                <Text style={[styles.newChatText, { color: colors.background }]}>
                  New
                </Text>
              </TouchableOpacity>
            </View>

            <FlatList
              data={conversations}
              keyExtractor={(c) => String(c.id)}
              style={styles.convList}
              keyboardShouldPersistTaps="handled"
              renderItem={({ item }) => {
                const active = item.id === activeConversationId;
                return (
                  <TouchableOpacity
                    style={[
                      styles.convRow,
                      { borderColor: colors.border },
                      active && { backgroundColor: colors.muted },
                    ]}
                    onPress={() => handleSwitch(item.id)}
                    disabled={isStreaming}
                    activeOpacity={0.7}
                  >
                    <Feather
                      name="message-circle"
                      size={16}
                      color={active ? colors.foreground : colors.mutedForeground}
                    />
                    <Text
                      style={[
                        styles.convTitle,
                        { color: active ? colors.foreground : colors.mutedForeground },
                      ]}
                      numberOfLines={1}
                    >
                      {item.title}
                    </Text>
                    {active && (
                      <Feather name="check" size={16} color={colors.foreground} />
                    )}
                  </TouchableOpacity>
                );
              }}
              ListEmptyComponent={
                <Text style={[styles.convEmpty, { color: colors.mutedForeground }]}>
                  No chats yet.
                </Text>
              }
            />
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  userInfo: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    flex: 1,
  },
  avatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
  },
  avatarFallback: {
    alignItems: "center",
    justifyContent: "center",
  },
  avatarInitial: {
    fontSize: 14,
    fontWeight: "700",
  },
  userName: {
    fontSize: 15,
    fontWeight: "600",
    flexShrink: 1,
  },
  headerActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  iconBtn: {
    padding: 4,
  },
  list: {
    paddingVertical: 12,
    gap: 4,
  },
  listEmpty: {
    flex: 1,
  },
  emptyContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 40,
    gap: 12,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: "700",
    textAlign: "center",
  },
  emptySubtitle: {
    fontSize: 14,
    textAlign: "center",
    lineHeight: 22,
  },
  modalOverlay: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "rgba(0,0,0,0.4)",
  },
  sheet: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 20,
    paddingTop: 10,
    maxHeight: "70%",
  },
  sheetHandle: {
    alignSelf: "center",
    width: 36,
    height: 4,
    borderRadius: 2,
    marginBottom: 12,
  },
  sheetHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  sheetTitle: {
    fontSize: 17,
    fontWeight: "700",
  },
  newChatBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
  },
  newChatText: {
    fontSize: 13,
    fontWeight: "600",
  },
  convList: {
    flexGrow: 0,
  },
  convRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    marginBottom: 8,
  },
  convTitle: {
    flex: 1,
    fontSize: 15,
    fontWeight: "500",
  },
  convEmpty: {
    textAlign: "center",
    paddingVertical: 24,
    fontSize: 14,
  },
});
