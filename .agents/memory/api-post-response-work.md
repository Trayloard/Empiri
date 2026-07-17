---
name: API post-response work needs Reserved VM
description: Self-evolution folds run after the HTTP response via an in-memory per-conversation queue — constraints this puts on deployment.
---

The api-server does self-evolution work (a multi-second LLM analysis + state fold) *after* `res.json`/`res.end`, serialized through an in-memory per-conversation promise queue. All persisted-self writers (message folds, check-in decay) must go through that queue and reload state inside their queued task — never save a self loaded before an `await`.

**Why:** Autoscale deployments only guarantee CPU while a request is being served, so post-response work can be killed mid-fold; and an in-memory queue only serializes within one process, so multiple instances reintroduce last-write-wins races. A check-in once saved a stale projection outside the queue and could clobber a concurrent fold.

**How to apply:** Deploy the api-server on a Reserved VM (or move folds into a persisted job queue) before shipping. When adding any new code path that saves the companion self, route it through the conversation queue with an in-queue reload.
