---
name: pnpm overrides single source
description: Why all pnpm overrides must live in pnpm-workspace.yaml only, never split with package.json
---

**Rule:** Keep every pnpm override in the `overrides:` section of `pnpm-workspace.yaml`. Never add a `pnpm.overrides` block to the root `package.json`.

**Why:** pnpm honors only ONE overrides source. When both exist, the root `package.json` `pnpm.overrides` silently wins and the entire `pnpm-workspace.yaml` `overrides:` section is ignored — no warning, no lockfile note. This left a security override (old vulnerable esbuild via drizzle-kit) inactive for a long time while looking configured. Diagnostic tell: the `overrides:` header at the top of `pnpm-lock.yaml` lists only the overrides that are actually active.

**How to apply:** When adding an override (security patch, version pin), put it in `pnpm-workspace.yaml`, run `pnpm install`, then confirm the override appears in the `overrides:` header of `pnpm-lock.yaml` and the resolved version changed. Also: replacement ranges must be bounded (e.g. `">=4.2.0 <5"`), or pnpm may jump a major (an unbounded js-yaml override once pulled 5.x). Catalog bumps only affect direct `catalog:` refs — transitive copies (e.g. vitest's vite) need a scoped override too.
