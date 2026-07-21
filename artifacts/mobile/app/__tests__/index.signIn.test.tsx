/**
 * Screen-level integration tests for the sign-in flow.
 *
 * Renders the real CompanionScreen (app/index.tsx) inside a real AuthProvider,
 * drives the OIDC callback via mocked expo-auth-session, and asserts the
 * user-visible transition from sign-in UI → authenticated chat screen.
 *
 * CompanionContext and all heavy native dependencies are mocked so the test
 * can focus purely on the auth-conditional rendering.
 */

import React from "react";
import { render, waitFor, fireEvent } from "@testing-library/react-native";

import * as SecureStore from "expo-secure-store";
import { useAuthRequest } from "expo-auth-session";

import { AuthProvider } from "@/lib/auth";

// ── Environment ───────────────────────────────────────────────────────────────
process.env.EXPO_PUBLIC_DOMAIN = "test.example.com";

// ── Heavy native modules ──────────────────────────────────────────────────────
jest.mock("expo-web-browser", () => ({
  maybeCompleteAuthSession: jest.fn(),
}));

jest.mock("expo-crypto", () => ({
  randomUUID: jest.fn(() => "mock-nonce-uuid"),
}));

jest.mock("expo-secure-store", () => ({
  getItemAsync: jest.fn(),
  setItemAsync: jest.fn(),
  deleteItemAsync: jest.fn(),
}));

jest.mock("expo-auth-session", () => ({
  useAutoDiscovery: jest.fn(() => ({
    tokenEndpoint: "https://replit.com/oidc/token",
    authorizationEndpoint: "https://replit.com/oidc/auth",
  })),
  useAuthRequest: jest.fn(),
  makeRedirectUri: jest.fn(() => "myapp://auth/redirect"),
  Prompt: { Login: "login" },
}));

jest.mock("expo-haptics", () => ({
  impactAsync: jest.fn(),
  ImpactFeedbackStyle: { Light: "light" },
}));

jest.mock("expo-status-bar", () => ({
  StatusBar: () => null,
}));

jest.mock("expo-blur", () => {
  const { View } = require("react-native");
  return { BlurView: View };
});

jest.mock("expo-router", () => ({
  useRouter: jest.fn(() => ({ push: jest.fn() })),
}));

jest.mock("@expo/vector-icons", () => ({
  Feather: () => null,
}));

jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

jest.mock("react-native-reanimated", () => {
  const { View } = require("react-native");
  return {
    __esModule: true,
    default: { View },
    useSharedValue: (v: unknown) => ({ value: v }),
    useAnimatedStyle: (cb: () => object) => cb(),
    useReducedMotion: () => false,
    withTiming: (v: unknown) => v,
    Easing: { out: () => {}, cubic: {} },
  };
});

jest.mock("react-native-gesture-handler", () => {
  const { View } = require("react-native");
  return {
    Gesture: { Pan: () => ({ onBegin: () => ({ onChange: () => ({}) }) }) },
    GestureDetector: ({ children }: { children: React.ReactNode }) => children,
    GestureHandlerRootView: View,
  };
});

jest.mock("react-native-keyboard-controller", () => {
  const { View } = require("react-native");
  return { KeyboardAvoidingView: View };
});

// ── App-local mocks ───────────────────────────────────────────────────────────
jest.mock("@/constants/fonts", () => ({ FONTS: { regular: "System" } }));

jest.mock("@/hooks/useColors", () => ({
  useColors: () => ({
    background: "#000",
    foreground: "#fff",
    mutedForeground: "#888",
    primary: "#6c47ff",
    primaryForeground: "#fff",
    destructive: "#f00",
    glass: "#111",
    glassBorder: "#222",
    blurTint: "dark",
    statusAccent: "#6c47ff",
    spectrum: ["#6c47ff", "#ff47c8"],
  }),
}));

jest.mock("@/hooks/useAccentColor", () => ({
  useSmoothedWarmth: () => 0,
}));

jest.mock("@/hooks/useCompanionTraits", () => ({
  useCompanionTraits: () => ({
    warmthShift: 0,
    energyShift: 0,
    curiosity: 0.5,
    emotionalDepth: 0.5,
  }),
}));

jest.mock("@/lib/accent", () => ({
  accentForWarmth: (_w: number, base: string) => base,
}));

jest.mock("@/components/AmbientGlow", () => ({ AmbientGlow: () => null }));
jest.mock("@/components/ChatInput", () => ({ ChatInput: () => null }));
jest.mock("@/components/ChatSwitcherSheet", () => ({ ChatSwitcherSheet: () => null }));
jest.mock("@/components/CheckInSettingsSheet", () => ({ CheckInSettingsSheet: () => null }));
jest.mock("@/components/CompanionOrb", () => ({ CompanionOrb: () => null }));
jest.mock("@/components/InnerSelfSheet", () => ({ InnerSelfSheet: () => null }));
jest.mock("@/components/MessageBubble", () => ({
  MessageBubble: () => null,
  RetryBubble: () => null,
  TypingBubble: () => null,
}));

// CompanionContext — return stable "authenticated idle" state when called.
const mockCompanion = {
  messages: [],
  status: "idle",
  voiceEnabled: false,
  notificationsEnabled: false,
  checkInCadence: 60,
  mood: { label: "content", intensity: 0.5 },
  conversationId: "conv-1",
  conversationTitle: "Chat",
  chats: [],
  refreshChats: jest.fn(),
  openConversation: jest.fn(),
  startNewChat: jest.fn(),
  renameConversation: jest.fn(),
  initializing: false,
  initError: null,
  error: null,
  failedTurn: false,
  isRecording: false,
  isCallActive: false,
  settings: { companionName: "Empiri", tone: "warm" },
  sendText: jest.fn(),
  retryMessage: jest.fn(),
  startListening: jest.fn(),
  stopListening: jest.fn(),
  startCall: jest.fn().mockResolvedValue(undefined),
  endCall: jest.fn(),
  toggleVoice: jest.fn(),
  toggleNotifications: jest.fn(),
  setCheckInCadence: jest.fn(),
  quietHours: { start: null, end: null },
  setQuietHours: jest.fn(),
  sensesEnabled: false,
  toggleSenses: jest.fn(),
  retryInit: jest.fn(),
  dismissError: jest.fn(),
  devTriggerCheckIn: jest.fn(),
  devScheduleNudgeSoon: jest.fn(),
  devRegressSelf: jest.fn(),
  signOut: jest.fn(),
};

jest.mock("@/contexts/CompanionContext", () => ({
  useCompanion: () => mockCompanion,
}));

// ── Helpers ───────────────────────────────────────────────────────────────────
const mockPromptAsync = jest.fn();
const mockUseAuthRequest = useAuthRequest as jest.Mock;
const mockGetItemAsync = SecureStore.getItemAsync as jest.Mock;
const mockSetItemAsync = SecureStore.setItemAsync as jest.Mock;

const MOCK_USER = {
  id: "user-1",
  email: "test@example.com",
  firstName: "Test",
  lastName: "User",
  profileImageUrl: null,
};

function renderScreen() {
  const CompanionScreen =
    require("../index").default as React.ComponentType;
  return render(<CompanionScreen />, {
    wrapper: ({ children }: { children: React.ReactNode }) => (
      <AuthProvider>{children}</AuthProvider>
    ),
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  mockPromptAsync.mockResolvedValue({ type: "dismiss" });
  mockUseAuthRequest.mockReturnValue([null, null, mockPromptAsync]);
  mockGetItemAsync.mockResolvedValue(null);
  mockSetItemAsync.mockResolvedValue(undefined);
  (SecureStore.deleteItemAsync as jest.Mock).mockResolvedValue(undefined);
  delete (globalThis as Record<string, unknown>).fetch;
});

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("CompanionScreen — sign-in flow", () => {
  it("renders the sign-in screen when the user is not authenticated", async () => {
    const { getByText } = renderScreen();

    await waitFor(() => {
      expect(getByText("Welcome to Empiri")).toBeTruthy();
      expect(getByText("Sign in to start your conversation.")).toBeTruthy();
      expect(getByText("Sign in")).toBeTruthy();
    });
  });

  it("pressing 'Sign in' calls promptAsync", async () => {
    const { getByText } = renderScreen();

    await waitFor(() => expect(getByText("Sign in")).toBeTruthy());
    fireEvent.press(getByText("Sign in"));

    expect(mockPromptAsync).toHaveBeenCalledTimes(1);
  });

  it("shows authenticated chat screen after successful OIDC callback + token exchange", async () => {
    mockUseAuthRequest.mockReturnValue([
      { codeVerifier: "pkce-verifier" },
      { type: "success", params: { code: "auth-code", state: "state-1" } },
      mockPromptAsync,
    ]);

    (globalThis as Record<string, unknown>).fetch = jest.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ token: "session-token-abc" }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ user: MOCK_USER }),
      }) as jest.Mock;

    mockGetItemAsync
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce("session-token-abc");

    const { queryByText, getByText } = renderScreen();

    await waitFor(() => {
      expect(queryByText("Welcome to Empiri")).toBeNull();
      expect(getByText("Say hi to Empiri")).toBeTruthy();
    });
  });

  it("stays on sign-in screen when token exchange returns 401", async () => {
    mockUseAuthRequest.mockReturnValue([
      { codeVerifier: "pkce-verifier" },
      { type: "success", params: { code: "bad-code", state: "state-1" } },
      mockPromptAsync,
    ]);

    (globalThis as Record<string, unknown>).fetch = jest.fn().mockResolvedValueOnce({
      ok: false,
      status: 401,
      json: async () => ({ error: "invalid_grant" }),
    }) as jest.Mock;

    mockGetItemAsync.mockResolvedValue(null);

    const { getByText } = renderScreen();

    await waitFor(() => {
      expect(getByText("Sign in")).toBeTruthy();
      expect(getByText("Welcome to Empiri")).toBeTruthy();
    });
  });
});
