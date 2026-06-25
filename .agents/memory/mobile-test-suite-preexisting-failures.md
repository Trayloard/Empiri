---
name: Mobile test-suite pre-existing failures
description: Known-failing mobile checks unrelated to UI work, so future agents don't block on them.
---

# Mobile pre-existing failures (artifacts/mobile)

When running `pnpm --filter @workspace/mobile test` / `run typecheck`, two failures
appear that are **independent of most UI/feature work** — verify your own diff is
clean, then don't block on these:

- **`lib/auth.tsx` typecheck:** `Property 'nonce' does not exist on type 'AuthRequest'`
  — an expo-auth-session typing mismatch. Present even when you haven't touched auth.

- **`contexts/__tests__/CompanionContext.test.tsx`:** the **entire file** fails
  **deterministically** (not just the proactive-check-in block — the failed-reply
  block fails the same way in isolation too). Every test times out at
  `waitFor(() => expect(result.current.initializing).toBe(false))`. The suite fully
  mocks `@workspace/api-client-react` (createConversation/listMessages/companionCheckIn),
  so the hang is in the provider's mount-time init, not the network.

**Why:** `CompanionProvider` now reads `useAuth()` and its mount effect does
`if (authLoading) return;` before anything sets `initializing` false. The test
wrapper renders `CompanionProvider` with **no `AuthProvider`**, so `useAuth()` returns
wstays true forever, the effect bails, and `initializing` never settles. The auth gate
was added after these tests were written; this is test maintenance, not product code.
A separate task (`#56 Fix the check-in tests that are currently failing`) owns the fix.

<!-- **How to apply:** if your task didn't touch `CompanionContext.tsx`/`lib/auth.tsx` or -->
their deps, treat these as pre-existing. For NEW CompanionContext tests, don't edit
this red file — make a self-contained sibling (e.g. `CompanionContext.dev.test.tsx`)
that `jest.mock("@/lib/auth")` to return `{ isAuthenticated: true, isLoading: false }`
so the provider initializes and your tests stay green.


