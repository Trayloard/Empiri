import React from "react";
import { act, renderHook, waitFor } from "@testing-library/react-native";
import * as SecureStore from "expo-secure-store";
import { useAuthRequest } from "expo-auth-session";

import { AuthProvider, useAuth } from "../auth";

/**
 * End-to-end regression tests for the mobile sign-in flow.
 *
 * Coverage:
 *  1. Unauthenticated on first launch (no stored token).
 *  2. Session restored from SecureStore on mount.
 *  3. Successful OIDC callback → token exchange → user authenticated.
 *  4. Token exchange returning 401 → user stays unauthenticated, nothing stored.
 *  5. login() delegates to expo-auth-session's promptAsync.
 */

// ── Environment ───────────────────────────────────────────────────────────────
process.env.EXPO_PUBLIC_DOMAIN = "test.example.com";

// ── expo-web-browser ──────────────────────────────────────────────────────────
jest.mock("expo-web-browser", () => ({
  maybeCompleteAuthSession: jest.fn(),
}));

// ── expo-auth-session ─────────────────────────────────────────────────────────
jest.mock("expo-auth-session", () => ({
  useAutoDiscovery: jest.fn(() => ({
    tokenEndpoint: "https://replit.com/oidc/token",
    authorizationEndpoint: "https://replit.com/oidc/auth",
  })),
  useAuthRequest: jest.fn(),
  makeRedirectUri: jest.fn(() => "myapp://auth/redirect"),
  Prompt: { Login: "login" },
}));

// ── expo-secure-store ─────────────────────────────────────────────────────────
// Inline factory avoids hoisting/TDZ issues with external variables.
jest.mock("expo-secure-store", () => ({
  getItemAsync: jest.fn(),
  setItemAsync: jest.fn(),
  deleteItemAsync: jest.fn(),
}));

// ── expo-crypto ───────────────────────────────────────────────────────────────
jest.mock("expo-crypto", () => ({
  randomUUID: jest.fn(() => "mock-nonce-uuid"),
}));

// ── Helpers ───────────────────────────────────────────────────────────────────
const mockPromptAsync = jest.fn();
const mockUseAuthRequest = useAuthRequest as jest.Mock;
const mockGetItemAsync = SecureStore.getItemAsync as jest.Mock;
const mockSetItemAsync = SecureStore.setItemAsync as jest.Mock;
const mockDeleteItemAsync = SecureStore.deleteItemAsync as jest.Mock;

function wrapper({ children }: { children: React.ReactNode }) {
  return <AuthProvider>{children}</AuthProvider>;
}

const MOCK_USER = {
  id: "user-1",
  email: "test@example.com",
  firstName: "Test",
  lastName: "User",
  profileImageUrl: null,
};

// ── Setup / teardown ──────────────────────────────────────────────────────────

beforeEach(() => {
  jest.clearAllMocks();
  mockUseAuthRequest.mockReturnValue([null, null, mockPromptAsync]);
  mockSetItemAsync.mockResolvedValue(undefined);
  mockDeleteItemAsync.mockResolvedValue(undefined);
  mockGetItemAsync.mockResolvedValue(null);
});

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("Auth sign-in flow", () => {
  it("starts unauthenticated when no token is stored", async () => {
    mockGetItemAsync.mockResolvedValue(null);

    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.isAuthenticated).toBe(false);
    expect(result.current.user).toBeNull();
  });

  it("restores an existing session from SecureStore on mount", async () => {
    mockGetItemAsync.mockResolvedValue("stored-session-token");
    global.fetch = jest.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => ({ user: MOCK_USER }),
    });

    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.isAuthenticated).toBe(true));

    expect(result.current.user?.id).toBe("user-1");
  });

  it("successful OIDC callback → token exchange → user authenticated + token stored", async () => {
    mockUseAuthRequest.mockReturnValue([
      { codeVerifier: "pkce-verifier-abc" },
      { type: "success", params: { code: "auth-code-xyz", state: "state-123" } },
      mockPromptAsync,
    ]);

    mockGetItemAsync
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce("session-token-new");

    global.fetch = jest.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ token: "session-token-new" }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ user: MOCK_USER }),
      });

    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.isAuthenticated).toBe(true));

    expect(mockSetItemAsync).toHaveBeenCalledWith(
      "auth_session_token",
      "session-token-new",
    );
    expect(result.current.user?.id).toBe("user-1");
    expect(result.current.isAuthenticated).toBe(true);
  });

  it("token exchange 401 → user stays unauthenticated, nothing stored", async () => {
    mockUseAuthRequest.mockReturnValue([
      { codeVerifier: "pkce-verifier-abc" },
      { type: "success", params: { code: "bad-auth-code", state: "state-123" } },
      mockPromptAsync,
    ]);

    mockGetItemAsync.mockResolvedValue(null);

    global.fetch = jest.fn().mockResolvedValueOnce({
      ok: false,
      status: 401,
      json: async () => ({ error: "invalid_grant" }),
    });

    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(mockSetItemAsync).not.toHaveBeenCalled();
    expect(result.current.isAuthenticated).toBe(false);
    expect(result.current.user).toBeNull();
  });

  it("login() delegates to expo-auth-session promptAsync", async () => {
    mockPromptAsync.mockResolvedValue({ type: "dismiss" });
    mockGetItemAsync.mockResolvedValue(null);

    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await act(async () => {
      await result.current.login();
    });

    expect(mockPromptAsync).toHaveBeenCalledTimes(1);
  });
});
