---
name: Empiri evolving inner self (Neurobrane-11)
description: How Empiri's persona is produced — a server-persisted, evolving self instead of a fixed system prompt — and the invariants that keep its bounded drive/decay loop honest.
---

# Empiri's persona is an evolving self, not a hardcoded prompt

Empiri's system prompt is **composed at request time** by `composePersona(self)` from a
per-conversation inner self (drives, drifting traits, growing interests, self-narrative).
There is no `COMPANION_SYSTEM_PROMPT` constant anymore. The pure logic lives in the
`@workspace/neurobrane` lib; the state is persisted one row per conversation in the
`companion_selves` table (jsonb `state` typed `.$type<InnerSelf>()`, unique `conversationId`).

**Why:** the goal was a companion that "becomes someone" over time — drives rise when fed and
decay during silence, traits drift slowly toward what the conversation rewards, interests grow
from topics the user raises. A static string can't do that. Centralizing every dial in
`lib/neurobrane/src/params.ts` (master `learningRate`, per-block weights, seed) keeps it tunable
and seedable, and the `defineBlock` registry lets future blocks snap in without touching the loop.

**How to apply:**
- To change Empiri's baseline personality or style, edit the core-self block / persona fragments
  in `lib/neurobrane`, not a prompt string in the api-server route.
- **`composePersona` must stay pure / non-persisting.** It may *project* decay to render the
  current self, but only `evolve` (after a genuine user message) and `project` (on check-in) are
  allowed to save. Lazy decay is anchored on `lastUpdatedAt`, which advances *only on save* — if
  composePersona ever persisted, you'd get double-decay between compose and the later evolve/save.
- The store row is created lazily (`loadOrCreateSelf`, race-safe via `onConflictDoNothing` + re-read).
  Evolve/save is best-effort and wrapped in try/catch so a personality-update failure never breaks
  a chat reply, voice, or check-in.
- Interest extraction is a deliberately naive, deterministic keyword picker (prefers longer content
  words over filler); a semantic extractor is a known future enhancement, not a bug.
