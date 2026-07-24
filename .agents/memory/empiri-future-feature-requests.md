---
name: Empiri future feature requests (user, July 2026)
description: Big feature ideas the user described in German and wants to be reminded about — neuromodulation reward system, self-coding skills, blank-slate first launch.
---

The user asked to be reminded of these; bring them up proactively.

## 1 — Dopamine/deficit "neuromodulation" in neurobrane
A reward system inside the evolving self: positive signals (good interactions, progress) act like dopamine — speed up / amplify tendencies; deficit signals act as a brake — slow down and dampen directions that go badly. The user offered to provide a detailed "Dopamin-Block" spec — ask for it before designing.
Relevant: `lib/neurobrane`, `companion_selves`, fold pipeline in `artifacts/api-server/src/routes/companion.ts`.

## 2 — Permissions for Empiri to self-analyze and code its own skills
User wants Empiri to analyze itself and write its own "skills", including a Replit-builder skill. Frame carefully: production self-modification isn't safe/possible directly; a sandboxed skill mechanism (server-stored, interpreted capabilities) is the realistic path.

## 3 — "Unbeschriebenes Blatt" (blank slate)
Each new user's Empiri should start as a completely blank slate at first download — no pre-shaped personality. User explicitly asked to be reminded about this later.
