---
name: Empiri check-in cadence vs notification bell
description: Why Empiri keeps two separate persisted prefs (proactive-outreach cadence + notification bell) and how they couple.
---

Empiri persists TWO independent preferences, not one:
- check-in cadence ("off" | "daily" | "frequent") — drives the in-app greeting
  threshold AND the OS local-notification nudge interval.
- notification bell (on/off) — gates whether OS nudges are scheduled at all.

Do NOT collapse these into a single value.

**Why:** A single knob cannot express the historical default "bell off, but
in-app greetings still happen on the frequent schedule" — the behavior every
existing user already has. The in-app greeting is permission-free and must keep
working when the bell (OS notifications) is off.

**How to apply:** Keep them separate; couple ONLY at the off boundary to avoid
the one contradictory combo (bell on + cadence off):
- set cadence "off"  -> cancel nudges AND turn the bell off.
- turn bell on while cadence is "off" -> restore cadence to default ("frequent").
- turn bell off -> cancel nudges; leave cadence (greeting still uses it).
- bell on -> schedule the nudge at cadenceHours(cadence).
Enabling the bell must request OS permission FIRST and mutate state only on
grant. Changing cadence never prompts for permission and never counts as a
companion interaction (no touchInteraction). Reschedule on cadence change with
remaining time = max(0, cadenceHours - hoursAway). Note: on web,
expo-notifications is a no-op, so the bell can never turn on there — e2e on web
can only exercise the cadence sheet, not the bell coupling.
