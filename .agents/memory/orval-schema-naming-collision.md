---
name: Orval schema naming collision
description: Naming an OpenAPI requestBody component "<Operation>Body" breaks api-zod codegen with a duplicate-export error.
---

Rule: never name a requestBody component schema `<OperationId>Body` in `lib/api-spec/openapi.yaml`. Use the `...Input` suffix (e.g. `CompanionSettingsInput`).

**Why:** orval's zod client auto-generates a schema named `<OperationId>Body` from the operation itself; a component with the same name makes `lib/api-zod/src/index.ts` re-export the symbol twice → TS2308 and codegen fails.

**How to apply:** when adding write operations to the spec, name the body schema `<Thing>Input`, then run `pnpm --filter @workspace/api-spec run codegen` (it regenerates zod + react clients and typechecks libs).
