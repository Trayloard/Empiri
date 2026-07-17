---
name: Meaning-based curiosity grouping
description: How Empiri groups mind-map curiosities by meaning server-side, and gotchas hit while building it.
---

Curiosity themes are computed server-side by the LLM and cached per topic-set signature in the companion self row; the client only consumes a topic→theme map (with a tiny singular/plural root fallback when the map is null/missing).

**Why:** a fixed keyword list can't keep up with synonyms/typos as Empiri learns new interests; grouping is display-only, so it must never influence how interests are stored or evolve.

**How to apply:** recompute only when the *set* of topics changes (affinity drift never triggers it); prune singleton themes server-side; return null on failure so the UI degrades to ungrouped.

Gotchas learned:
- Postgres JSONB rejects `\u0000` — never use NUL as a join separator in values persisted as JSONB (use `\n`).
- gpt-5-mini spends completion budget on reasoning: a 1024 `max_completion_tokens` cap can yield empty content; use ≥4096 for small JSON tasks.
- If the prompt lists topics with decorations (e.g. `topic (shown as "X")`), the model echoes the whole line as the JSON key — list bare keys only.
