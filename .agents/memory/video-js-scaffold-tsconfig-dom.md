---
name: video-js scaffold typecheck needs DOM lib
description: video-js artifact scaffolds inherit a base tsconfig with no DOM lib, so per-artifact typecheck fails on browser APIs until you add it locally.
---

# video-js scaffold typecheck fails without DOM lib

A freshly-created `video-js` artifact's `pnpm run typecheck` fails out of the box
on browser APIs (`window`, `document`, `HTMLAudioElement.play/volume/currentTime`,
`Node`, `PointerEvent.pointerType`) — even in scaffold files you never touched
(e.g. `src/hooks/use-mobile.tsx`, `src/lib/video/animations.ts` framer-motion
`Variant` errors).

**Cause:** the shared root `tsconfig.base.json` sets `"lib": ["es2022"]` with no
`dom`, and the video artifact's own tsconfig doesn't re-add it.

**Fix:** add `"lib": ["es2022", "dom", "dom.iterable"]` to the *artifact's own*
`artifacts/<slug>/tsconfig.json` compilerOptions — NOT the shared base. This also
clears the cascading framer-motion `animations.ts` type errors (they stemmed from
missing DOM types). Vite dev/build never surfaces this because esbuild skips
typechecking.

**Why:** keeps the fix localized to the browser artifact; the base tsconfig is
shared by non-DOM packages too.

**How to apply:** any time you add DOM/audio code to a video-js artifact and want
a clean `typecheck`, patch the artifact tsconfig first instead of debugging the
"Cannot find name 'window'" errors as if they were real bugs.
