---
name: neurobrane interest display vs key
description: Curiosity/interest display casing is a separate cosmetic channel from the normalized matching key; never let display affect dedup.
---

# Interest display casing vs normalized key

In neurobrane, each interest/curiosity has two distinct fields that travel
separate channels:

- **key** (`Interest.topic`, `InterestSummary.topic`, `CompanionInterest.topic`):
  normalized lowercase via `normalizeTopic`. This is the ONLY thing
  matching/dedup/decay may key on. One interest per normalized key.
- **display** (`Interest.display?`, `InterestSummary.display`,
  `CompanionInterest.display`): best original casing for the UI
  (proper-noun aware). Cosmetic only.

**Why:** Users raise the same curiosity with different casing ("Paris" vs
"paris"); these must collapse to one interest, but the UI should show the
capitalized proper name. Keeping display out of the matching path is what
preserves the dedup invariant.

**How to apply:**
- Extraction: `extractTopicsDetailed()` returns `{key, display}`;
  `extractTopics()` is a `.map(t=>t.key)` wrapper — keep that key-only
  contract (existing tests depend on it).
- `preferredDisplay(current, candidate)`: an uppercase-bearing casing beats
  all-lowercase; otherwise sticky. Used on create + reinforce; decay must
  preserve display via spread.
- Any future feature that touches interests (e.g. "group curiosities by
  meaning"/theme grouping) must still match on the normalized key, never on
  display.
- `*.display` is optional on persisted blobs (`Interest`) for back-compat;
  summarize/getSelfHistory fall back `display ?? topic`. The API/client
  `display` is required, so old snapshot read paths must backfill it.
