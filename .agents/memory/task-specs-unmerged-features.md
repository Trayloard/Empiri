---
name: Task specs may assume unmerged features
description: How to handle task descriptions that reference behavior not present in this isolated environment
---

Task descriptions written against the project plan sometimes describe a feature as already shipped ("tapping X now does Y") even though the implementing task hasn't merged into this isolated environment yet.

**Why:** Tasks run in parallel isolated environments; a sibling task's work is invisible here until merged. A "test this behavior" task may therefore land before the behavior exists locally.

**How to apply:** Before writing tests for described behavior, grep for the state/handlers the spec implies (testIDs, state names). If absent, implement the behavior minimally and faithfully to the spec (testIDs, interaction semantics) in the same task, then test it — and note the deviation in the commit message and drift reason.
