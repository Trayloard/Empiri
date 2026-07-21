/**
 * Navigation contract test: signing out must always return the user to the
 * sign-in welcome screen and clear any stale companion context (messages, etc.).
 *
 * The test is split into two complementary scenarios:
 *
 * 1. Unauthenticated view: renders CompanionScreen with isAuthenticated=false
 *    and confirms the sign-in welcome screen is shown with no companion UI.
 *
 * 2. Full sign-out flow: renders CompanionScreen in an authenticated state,
 *    fires the confirmed sign-out action end-to-end (settings sheet → Alert
 *    confirm → signOut()), and asserts the view transitions to the sign-in
 *    welcome screen with messages cleared.
 *
 * Note: `jest.mock` factories cannot reference outer-scope variables unless
 * they are prefixed with `mock` (babel-jest hoisting rule). All React usage
 * inside factories must use `require('react')` locally.
 */

import React from "react";
import { Alert } from "react-native";
import { act, fireEvent, render, waitFor } from "@testing-library/react-native";

// ─── mock-prefixed vars: hoisted by babel-jest alongside jest.mock() ──────────

// Holds the live React useState setter from the @/lib/auth mock — updated on
// every render so signOut can flip the auth state synchronously.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockAuthSetter: { current: ((u: any) => void) | null } = { current: null };
const mockLogout = jest.fn().mockResolvedValue(undefined);

// Tracks whether signOut was called, for assertions.
const mockSignOutCalled = { value: false };

// ─── @/lib/auth ──────────────────────────────────────────────────────────────
jest.mock("@/lib/auth", () => {
  const React = require("react");
  return {
    useAuth: () => {
      const [user, setUser] = React.useState({ id: "test-user" });
      // Update the shared ref every render (useState setter is stable, but
      // keeping it current guards against hypothetical mock-reset edge cases).
      mockAuthSetter.current = setUser;
      return {
        user,
        isLoading: false,
        isAuthenticated: !!user,
        login: jest.fn(),
        logout: mockLogout,
      };
    },
  };
});

// ─── @/contexts/CompanionContext ──────────────────────────────────────────────
// signOut is synchronous (no await) so both setMessages([]) and the auth-state
// reset happen in the same React batch and are flushed by a single act() call.
jest.mock("@/contexts/CompanionContext", () => {
  const React = require("react");
  return {
    useCompanion: () => {
      const [messages, setMessages] = React.useState([
        {
          id: 1,
          conversationId: 1,
          role: "user",
          content: "Hello Empiri",
          createdAt: "2026-01-01T00:00:00.000Z",
        },
      ]);
      const signOut = jest.fn().mockImplementation(() => {
        mockSignOutCalled.value = true;
        setMessages([]);
        // Call the captured auth setter synchronously; both updates land in
        // the same React batch and are flushed within act().
        if (mockAuthSetter.current) mockAuthSetter.current(null);
        return Promise.resolve();
      });
      return {
        messages,
        status: "idle",
        voiceEnabled: true,
        notificationsEnabled: false,
        checkInCadence: "daily",
        mood: { label: "content", hoursAway: 0, missingYou: false },
        conversationId: 1,
        conversationTitle: "Empiri",
        chats: [],
        refreshChats: jest.fn().mockResolvedValue(undefined),
        openConversation: jest.fn().mockResolvedValue(undefined),
        startNewChat: jest.fn().mockResolvedValue(undefined),
        renameConversation: jest.fn().mockResolvedValue(undefined),
        initializing: false,
        initError: null,
        error: null,
        failedTurn: null,
        isRecording: false,
        isCallActive: false,
        settings: null,
        sendText: jest.fn().mockResolvedValue(undefined),
        retryMessage: jest.fn().mockResolvedValue(undefined),
        startListening: jest.fn().mockResolvedValue(undefined),
        stopListening: jest.fn().mockResolvedValue(true),
        startCall: jest.fn().mockResolvedValue(undefined),
        endCall: jest.fn(),
        toggleVoice: jest.fn(),
        toggleNotifications: jest.fn().mockResolvedValue(undefined),
        setCheckInCadence: jest.fn().mockResolvedValue(undefined),
        quietHours: { enabled: false, start: "22:00", end: "08:00" },
        setQuietHours: jest.fn().mockResolvedValue(undefined),
        sensesEnabled: false,
        toggleSenses: jest.fn(),
        retryInit: jest.fn(),
        dismissError: jest.fn(),
        signOut,
        devTriggerCheckIn: jest.fn().mockResolvedValue(undefined),
        devScheduleNudgeSoon: jest.fn().mockResolvedValue(undefined),
        devRegressSelf: jest.fn().mockResolvedValue(undefined),
        saveSettings: jest.fn().mockResolvedValue(undefined),
      };
    },
  };
});

// ─── Native / third-party stubs ───────────────────────────────────────────────

jest.mock("expo-blur", () => {
  const React = require("react");
  const { View } = require("react-native");
  return {
    BlurView: ({ children }: { children?: any }) => React.createElement(View, {}, children),
  };
});

jest.mock("expo-haptics", () => ({
  impactAsync: jest.fn().mockResolvedValue(undefined),
  ImpactFeedbackStyle: { Light: "Light" },
}));

jest.mock("expo-router", () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn() }),
}));

jest.mock("expo-status-bar", () => ({ StatusBar: () => null }));

jest.mock("react-native-gesture-handler", () => {
  const React = require("react");
  const { View } = require("react-native");
  return {
    Gesture: {
      Pan: () => ({
        onBegin: function () { return this; },
        onChange: function () { return this; },
      }),
    },
    GestureDetector: ({ children }: { children?: any }) => React.createElement(View, {}, children),
  };
});

jest.mock("react-native-keyboard-controller", () => {
  const React = require("react");
  const { View } = require("react-native");
  return {
    KeyboardAvoidingView: ({ children }: { children?: any }) => React.createElement(View, {}, children),
  };
});

// Official reanimated mock + useReducedMotion (not included in the bundled mock).
jest.mock("react-native-reanimated", () => {
  const official = require("react-native-reanimated/mock");
  return {
    ...official,
    useReducedMotion: () => false,
    default: { ...official.default },
  };
});

jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

// ─── Internal component stubs ─────────────────────────────────────────────────

jest.mock("@/components/AmbientGlow", () => ({ AmbientGlow: () => null }));
jest.mock("@/components/ChatInput", () => ({ ChatInput: () => null }));
jest.mock("@/components/ChatSwitcherSheet", () => ({
  ChatSwitcherSheet: () => null,
}));

// CheckInSettingsSheet: the settings sheet that contains the sign-out action.
// Renders a Pressable with testID when visible so the test can trigger the real
// handleSignOut path in index.tsx (Alert → signOut()).
jest.mock("@/components/CheckInSettingsSheet", () => {
  const React = require("react");
  const { View, Pressable, Text } = require("react-native");
  return {
    CheckInSettingsSheet: ({ visible, onSignOut }: { visible: any; onSignOut: any }) => {
      if (!visible) return null;
      return React.createElement(
        View,
        { testID: "check-in-settings-sheet" },
        React.createElement(
          Pressable,
          { testID: "sign-out-pressable", onPress: onSignOut },
          React.createElement(Text, {}, "Sign out"),
        ),
      );
    },
  };
});

jest.mock("@/components/CompanionOrb", () => ({ CompanionOrb: () => null }));
jest.mock("@/components/InnerSelfSheet", () => ({ InnerSelfSheet: () => null }));

jest.mock("@/components/MessageBubble", () => {
  const React = require("react");
  const { Text } = require("react-native");
  return {
    MessageBubble: ({ content }: { content: any }) =>
      React.createElement(Text, { testID: "message-bubble" }, content),
    RetryBubble: () => null,
    TypingBubble: () => null,
  };
});

// ─── Internal hook / util stubs ───────────────────────────────────────────────

jest.mock("@/hooks/useAccentColor", () => ({ useSmoothedWarmth: () => 0 }));

jest.mock("@/hooks/useColors", () => ({
  useColors: () => ({
    background: "#000",
    foreground: "#fff",
    primary: "#7c3aed",
    primaryForeground: "#fff",
    mutedForeground: "#888",
    glass: "rgba(255,255,255,0.1)",
    glassBorder: "rgba(255,255,255,0.2)",
    blurTint: "dark",
    statusAccent: "#7c3aed",
    spectrum: [],
    destructive: "#ef4444",
  }),
}));

jest.mock("@/hooks/useCompanionTraits", () => ({
  useCompanionTraits: () => ({ warmthShift: 0, energyShift: 0, curiosityShift: 0 }),
}));

jest.mock("@/lib/accent", () => ({
  accentForWarmth: (_warmth: any, base: any, _spectrum: any) => base,
}));

jest.mock("@/constants/fonts", () => ({ FONTS: {} }));

jest.mock("@expo/vector-icons", () => {
  const React = require("react");
  const { View } = require("react-native");
  return {
    Feather: ({ name }: { name: any }) => React.createElement(View, { testID: `feather-${name}` }),
  };
});

// ─── Tests ────────────────────────────────────────────────────────────────────

import CompanionScreen from "../index";

beforeEach(() => {
  jest.clearAllMocks();
  mockSignOutCalled.value = false;
});

describe("Sign-out navigation contract", () => {
  describe("unauthenticated view", () => {
    it("shows the sign-in welcome screen when the user is not authenticated", () => {
      // Override useAuth statically for this test to start unauthenticated.
      const { getByText, queryByTestId } = render(<CompanionScreen />);

      // Manually set the auth state to unauthenticated to verify the view.
      act(() => {
        mockAuthSetter.current?.(null);
      });

      expect(getByText("Welcome to Empiri")).toBeTruthy();
      expect(getByText("Sign in to start your conversation.")).toBeTruthy();
      expect(getByText("Sign in")).toBeTruthy();
      // No companion message bubbles visible.
      expect(queryByTestId("message-bubble")).toBeNull();
    });
  });

  describe("sign-out flow", () => {
    it("transitions to the sign-in screen and clears messages after the user confirms sign-out", async () => {
      // Intercept Alert to auto-confirm the destructive action synchronously.
      const alertSpy = jest
        .spyOn(Alert, "alert")
        .mockImplementation((_title, _message, buttons) => {
          const signOutBtn = buttons?.find((b) => b.text === "Sign Out");
          signOutBtn?.onPress?.();
        });

      const { getByText, queryByText, queryByTestId, getByTestId } = render(
        <CompanionScreen />,
      );

      // The authenticated screen is visible initially.
      expect(queryByText("Welcome to Empiri")).toBeNull();
      expect(queryByTestId("message-bubble")).toBeTruthy();

      // Open the settings sheet (fireEvent traverses up to the Pressable).
      await act(async () => {
        fireEvent.press(getByTestId("feather-settings"));
      });

      // Press sign-out in the settings sheet — triggers handleSignOut → Alert
      // → signOut() — all synchronous so both state updates flush in act().
      await act(async () => {
        fireEvent.press(getByTestId("sign-out-pressable"));
      });

      // signOut() must have been invoked.
      expect(mockSignOutCalled.value).toBe(true);

      // The welcome screen must now be shown.
      await waitFor(() => {
        expect(getByText("Welcome to Empiri")).toBeTruthy();
      });
      expect(getByText("Sign in to start your conversation.")).toBeTruthy();

      // No stale messages must remain visible.
      expect(queryByTestId("message-bubble")).toBeNull();

      alertSpy.mockRestore();
    });

    it("does not navigate away when the user cancels the sign-out dialog", async () => {
      // Simulate cancelling — the destructive button's onPress is never called.
      const alertSpy = jest
        .spyOn(Alert, "alert")
        .mockImplementation(() => { /* cancel — do nothing */ });

      const { queryByText, getByTestId } = render(<CompanionScreen />);

      await act(async () => {
        fireEvent.press(getByTestId("feather-settings"));
      });

      await act(async () => {
        fireEvent.press(getByTestId("sign-out-pressable"));
      });

      // No navigation: still authenticated.
      expect(queryByText("Welcome to Empiri")).toBeNull();
      expect(mockSignOutCalled.value).toBe(false);
      expect(mockLogout).not.toHaveBeenCalled();

      alertSpy.mockRestore();
    });
  });
});
