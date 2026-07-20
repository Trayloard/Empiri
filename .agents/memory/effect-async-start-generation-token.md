---
name: Async start() in RN effect lifecycles needs a generation token
description: Pattern for sensor/listener effects whose start() awaits before subscribing — prevents leaked listeners on rapid AppState flips.
---

**Rule:** In a React Native effect that starts/stops device listeners on AppState changes, any `start()` that `await`s something (e.g. an initial battery/permission read) before attaching listeners must capture a generation token (`const gen = ++generation`) and bail after the await if `gen !== generation`; `stop()` bumps the generation.

**Why:** Architect review of the senses feature found that a `cancelled` flag set only in the effect cleanup is not enough — a background transition calls `stop()` without cleanup, so a still-pending `start()` attaches listeners afterwards and they leak until unmount (unremovable, since `stop()` already ran and later assignments overwrite the sub handles).

**How to apply:** Whenever an effect has `start()/stop()` pairs driven by `AppState.addEventListener("change", ...)` and `start()` is async, add the generation counter. A plain boolean is insufficient if start/stop can cycle more than once.
