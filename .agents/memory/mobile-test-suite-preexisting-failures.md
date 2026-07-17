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

- **`contexts/__tests__/CompanionContext.test.tsx`: FIXED (July 2026).** The file
  used to fail wholesale because `CompanionProvider` gained a `useAuth()` gate after
  the tests were written; with no `AuthProvider` in the tree, `authLoading` stayed
  true and `initializing` never settled. The file now `jest.mock("@/lib/auth")` with
  a settled signed-in state, and the `@workspace/api-client-react` mock covers every
  function the provider imports (listConversations, getConversation,
  getCompanionSettings, etc. — missing ones broke init). All tests pass.

**How to apply:** when adding CompanionContext tests, keep both mocks intact. If the
provider gains new imports from the api client, add them to the module mock or init
silently breaks again.


