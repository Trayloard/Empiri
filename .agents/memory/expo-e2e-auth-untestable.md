---
name: Expo e2e auth untestable
description: runTest's Replit-auth OIDC override doesn't work for the Empiri Expo app
---
The testing subagent's `testReplitAuth: true` claim-override does not work for the Empiri mobile (Expo web) app: its login uses expo-auth-session's popup `AuthRequest`, which lands on a real email/password form instead of auto-applying configured claims.

**Why:** the override hooks the server-side ISSUER_URL redirect flow; the Expo popup flow bypasses it.

**How to apply:** don't spend runTest budget trying to get past the sign-in gate on the mobile artifact. Verify signed-in UI via typecheck + jest, or test unauthenticated states only. (Also: keep runTest plans short — a long plan once hit the 600s code_execution timeout.)
