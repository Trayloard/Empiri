---
name: Mobile test-suite pre-existing failures
description: Known-failing mobile checks unrelated to UI work, so future agents don't block on them.
---

# Mobile pre-existing failures (artifacts/mobile)

When running `pnpm --filter @workspace/mobile test` / `run typecheck`, two failures
appear that are **independent of most UI/feature work** — verify your own diff is
clean, then don't block on these:

- **`lib/auth.tsx` typecheck: FIXED (July 2026).** The `nonce` error is gone —
  expo-auth-session's AuthRequest never had a nonce property (it was undefined at
  runtime), so the token-exchange body no longer sends it; the server treats nonce
  as optional. Don't re-add `request.nonce`.

- **`contexts/__tests__/CompanionContext.test.tsx`: FIXED (July 2026).** The file
  used to fail wholesale because `CompanionProvider` gained a `useAuth()` gate after
  the tests were written; with no `AuthProvider` in the tree, `authLoading` stayed
  true and `initializing` never settled. The file now `jest.mock("@/lib/auth")` with
  a settled signed-in state, and the `@workspace/api-client-react` mock covers every
  function the provider imports (listConversations, getConversation,
  getCompanionSettings, etc. — missing ones broke init). All tests pass.

**How to apply:** when adding CompanionContext tests, keep both mocks intact. If the
provider gains new imports from the api client, add them to **every** test file's
module mock — there are multiple files (`CompanionContext.test.tsx`,
`CompanionContext.dev.test.tsx`) and each mocks `@workspace/api-client-react`
independently; a missing function makes init throw silently and check-in tests
fail with "expected 1 call, received 0". Both files are green as of July 2026.


