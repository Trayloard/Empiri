---
name: Monorepo typecheck gotchas
description: Why root pnpm typecheck fails in mockup-sandbox and how per-package typecheck can mislead in this pnpm monorepo.
---

# Monorepo typecheck gotchas

## Root typecheck is green and gated (July 2026)
Root `pnpm run typecheck` now passes cleanly and is registered as a
"typecheck" validation command alongside "test". The old mockup-sandbox
duplicate `@types/react` failure no longer reproduces at root. Keep it green:
any typecheck regression now blocks task completion.

**How to apply:** in ownership-gated api-server routes, get the user id from
`requireOwnedConversation()`'s returned conversation (`ownerId` is narrowed to
string) instead of `req.user.id`, which TS sees as possibly undefined.

## Per-package typecheck uses stale lib declarations
`pnpm --filter @workspace/<artifact> run typecheck` does NOT rebuild the
composite `lib/*` packages first, so it can report bogus "has no exported
member" errors against stale `lib/*/dist/*.d.ts` (e.g. api-client-react showing
an old `ConversationDetailEnvelope` shape).
**How to apply:** trust the root `pnpm run typecheck` (it runs
`typecheck:libs` = `tsc --build` first) over an isolated per-package run.
To refresh a single lib's declarations without the full root run:
`pnpm exec tsc -b lib/<pkg>/tsconfig.json` (the libs have no `build` script;
they are composite `emitDeclarationOnly` projects writing to `dist/`).
