---
name: Deferred personalization follow-ups
description: Three feature ideas the user wants to be reminded about next session — proposed after companion personalization (Task #74) but cancelled by user.
---

Remind the user of these at the start of the next session and ask if they'd like to tackle any of them.

## 1 — Companion name & tone in the chat header
Show the saved companion name (instead of hardcoded "Empiri") in the chat header, plus a subtle tone badge. Tapping opens the companion-settings screen directly.  
Relevant files: `artifacts/mobile/app/index.tsx`, `artifacts/mobile/app/companion-settings.tsx`, `artifacts/mobile/contexts/CompanionContext.tsx`

## 2 — Companion evolution / mood log
A timeline screen showing how Empiri's inner self has changed over time — one brief snapshot per session (dominant traits + a generated sentence). Needs `GET /companion/evolution-log` backed by `companion_selves`.  
Relevant files: `artifacts/api-server/src/routes/companion.ts`, `lib/db/src/schema/` (companion_selves), `artifacts/mobile/app/companion-settings.tsx`  
Note (July 2026): a related follow-up task ("see what Empiri thought about while you were away", surfacing reflection narrative moments) is already in the project task list — mention both together, they'd combine well.

## 3 — Auth-gate the companion-settings screen
`/companion-settings` has no explicit auth guard; an unauthenticated deep-link hits the API and gets a raw 401. Should redirect to sign-in, matching the pattern in `app/index.tsx`.  
Relevant files: `artifacts/mobile/app/companion-settings.tsx`, `artifacts/mobile/app/_layout.tsx`, `artifacts/mobile/contexts/AuthContext.tsx`
