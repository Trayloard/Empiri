---
name: orval codegen vs Metro transient resolve error
description: Why Metro logs "Unable to resolve ./generated/api" right after running api-spec codegen, and that it is harmless.
---

After running `pnpm --filter @workspace/api-spec run codegen`, the Expo/Metro
bundler may log:

```
Unable to resolve "./generated/api" from "lib/api-client-react/src/index.ts"
```

**Why:** orval is configured with `clean: true`, so it deletes the
`lib/api-client-react/src/generated/` folder and rewrites it. If Metro's file
watcher tries to re-bundle during that brief window, it sees the folder empty
and reports an unresolved import. The files are regenerated moments later.

**How to apply:** This is transient, not a real breakage. Confirm the generated
files exist (`ls lib/api-client-react/src/generated/`) and restart the
`artifacts/mobile: expo` workflow — the next bundle is clean. Do NOT chase it as
a code bug. Note that `refresh_all_logs` rotates log files only when called, so a
stale pre-restart log can still show the error; pull a fresh log (or take an app
screenshot — a rendered screen proves the bundle succeeded) to verify.
