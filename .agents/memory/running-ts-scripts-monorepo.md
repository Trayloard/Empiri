---
name: Running ad-hoc TS scripts against workspace packages
description: Why one-off Node/tsx scripts that import @workspace/* packages fail, and what to do instead
---

Ad-hoc scripts that import `@workspace/*` packages (e.g. to DB-test a server helper without the LLM) are painful in this monorepo:

- `tsx` is NOT installed in `artifacts/api-server` (`pnpm exec tsx` → not found).
- Node 24 strips TS types natively, but a script in `/tmp` cannot resolve workspace packages (no node_modules there) — place the script inside the package dir instead.
- Even then, `@workspace/db` (and peers) resolve their package `exports` to **TS source** which uses extensionless **directory imports** (`export * from "./schema"`). Native Node ESM rejects these → `ERR_UNSUPPORTED_DIR_IMPORT`. Only a bundler (esbuild at runtime, or tsx) handles them; the api-server bundles with esbuild for exactly this reason.

**How to apply:** Don't burn time on node-based scripts for workspace-package logic. Prefer (1) pure unit tests via the package's own jest (e.g. mobile), (2) verify server logic through the running HTTP API (lower thresholds via env to hit throttle/branch paths cheaply), or (3) install tsx only if a true DB-level script is unavoidable.
