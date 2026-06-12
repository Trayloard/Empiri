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

- **`contexts/__tests__/CompanionContext.test.tsx`:** the proactive-check-in block
  fails **deterministically** (not flaky), ~8 tests, all timing out at
  `waitFor(() => expect(result.current.initializing).toBe(false))`. The suite fully
  mocks `@workspace/api-client-react` (createConversation/listMessages/companionCheckIn),
  so the hang is in the provider's mount-time init, not the network.

**Why:** the test wrapper renders `CompanionProvider` without the surrounding
providers the current init flow expects (e.g. auth/token state), so init never
settles. The test predates a provider change; it's test maintenance, not product code.

**How to apply:** if your task didn't touch `CompanionContext.tsx`/`lib/auth.tsx` or
their deps, treat these as pre-existing. Confirm your own new/changed suites pass and
the app renders, then proceed. Fixing the CompanionContext wrapper is its own
test-maintenance task.
