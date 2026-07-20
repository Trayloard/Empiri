---
name: Monorepo typecheck gotchas
description: Why root pnpm typecheck fails in mockup-sandbox and how per-package typecheck can mislead in this pnpm monorepo.
---

# Monorepo typecheck gotchas

## Pre-existing mockup-sandbox typecheck failure (duplicate @types/react)
Running root `pnpm run typecheck` fails in `artifacts/mockup-sandbox`
(`src/components/ui/calendar.tsx`, `src/components/ui/spinner.tsx`) with
"Two different types with this name exist, but they are unrelated"
(VoidOrUndefinedOnly / React.Ref).

**Cause:** the workspace resolves TWO `@types/react` versions at once —
`19.1.17` (pulled by the React Native / `@workspace/mobile` side, pinned
`~19.1.x`) and `19.2.14` (catalog `^19.2.0`, used by web artifacts like
mockup-sandbox). Both versions exist in `pnpm-lock.yaml` and this duplication
predates recent mobile work (verified present at HEAD).

**Why it matters:** this failure is NOT caused by changes to the mobile app or
its test setup. When you touch `artifacts/mobile` and see root typecheck red,
check whether the only errors are in `mockup-sandbox` — if so it's pre-existing,
don't chase it. A real fix would be deduping `@types/react` across the monorepo
(align the RN pin with the catalog, or add an override), which is a broad,
risky change to do only when explicitly in scope.

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
