# Senses QA Checklist

Device senses let Empiri notice real-world context — motion, power state, and time of day — and weave them into the conversation naturally. This checklist covers every sense trigger, how to reproduce it, what percept the context should record, and what flavour of companion response to expect.

All senses are **opt-in** (off by default). Run the opt-in toggle check first; every subsequent test requires senses to be enabled.

---

## Prerequisites

| Step | Action | Expected |
|------|--------|----------|
| P1 | Open **Settings → Device Senses** with senses OFF | Toggle shows off; no sensor subscriptions attach |
| P2 | Enable senses | Toggle persists after force-quitting and re-opening the app |
| P3 | Disable senses, then force-quit and reopen | Toggle remains off; no percepts are sent with the next message |

---

## 1. Daypart (Ambient Time-of-Day)

**Source:** `daypartPercept()` — always included when senses are on; no permissions required; works on web.

**Buckets:**

| Hour range | Daypart key |
|-----------|-------------|
| 00:00–04:59 | `late_night` |
| 05:00–07:59 | `early_morning` |
| 08:00–10:59 | `morning` |
| 11:00–13:59 | `midday` |
| 14:00–16:59 | `afternoon` |
| 17:00–20:59 | `evening` |
| 21:00–23:59 | `night` |

| ID | Trigger | Expected percept sent | Expected companion flavour |
|----|--------|----------------------|--------------------------|
| D1 | Send any message at 09:15 with senses on | `kind: "daypart", detail: "morning"` | Reply may reference morning energy, coffee, a fresh start |
| D2 | Send a message at 22:30 | `kind: "daypart", detail: "night"` | Reply may reference tiredness, winding down, being up late |
| D3 | Send a message at 02:00 | `kind: "daypart", detail: "late_night"` | Reply may express gentle concern about being up so late |
| D4 | Disable senses; send a message | No `daypart` percept in request | Reply contains no time-of-day references |
| D5 | *(Web browser)* Enable senses; send a message | Only `daypart` percept sent (no motion/battery) | Reply acknowledges time of day; no shake/battery references |

---

## 2. Shake Detection

**Source:** `detectShake()` — requires accelerometer; native only; no permissions dialog on iOS/Android.

**Key constants:**
- Threshold: **2.2 g** (total magnitude)
- Cooldown: **8 000 ms** between consecutive shake percepts

| ID | Trigger | Expected percept | Expected companion flavour |
|----|--------|-----------------|--------------------------|
| S1 | Shake phone firmly (one confident shake) with senses on | `kind: "shake", intensity: 0.5–1.0` appended to next send | Empiri notices movement, might ask if everything is OK or comment on restlessness |
| S2 | Shake twice within 8 seconds | Only **one** shake percept recorded (cooldown) | Single shake acknowledgement |
| S3 | Shake, wait 10 seconds, shake again | **Two** shake percepts (each drains on send) | Second shake only present if first already sent; otherwise one percept with most-recent shake |
| S4 | Gentle tilt / slow movement well below 2.2 g | No shake percept recorded | No shake acknowledgement |
| S5 | Shake with senses **disabled** | No percept recorded | No shake acknowledgement |
| S6 | Shake while app is **backgrounded** | No percept recorded (accelerometer sub removed on background) | No shake acknowledgement |
| S7 | Shake, background the app, foreground it, send a message | Shake percept recorded before background; sent on next message (buffer persists) | Shake acknowledged |

---

## 3. Charging Start

**Source:** `chargingPercept()` — fires only on the `false → true` transition; requires `expo-battery`.

**Design intent:** Plugging in the charger *after* the app is already open feels like an event. Already charging when the app opens is ambient context (no event fired).

| ID | Trigger | Expected percept | Expected companion flavour |
|----|--------|-----------------|--------------------------|
| C1 | App open and idle (not charging), then plug in charger | `kind: "charging", intensity: 0.4` on next send | Empiri notices device is charging; may make a warm remark about taking a break, recharging |
| C2 | App open while phone is **already** charging | No charging percept | No charging reference |
| C3 | Unplug charger, then plug back in (while app open) | One `charging` percept recorded on re-plug | Empiri notices the re-plug event |
| C4 | Plug in charger with senses **disabled** | No percept | No charging reference |
| C5 | Battery at 100 % (FULL state), plug in | No charging percept (`FULL` state reads as charging → wasCharging already true) | No event |

---

## 4. Battery Low

**Source:** `batteryLowPercept()` — fires when level drops below **20 %** and device is unplugged; at most **once per session**.

| ID | Trigger | Expected percept | Expected companion flavour |
|----|--------|-----------------|--------------------------|
| B1 | Battery drains from above 20 % to below 20 % while unplugged | `kind: "battery_low", intensity: 0.55` on next send | Empiri expresses gentle concern, may suggest charging soon |
| B2 | Battery already below 20 % when senses are first turned on (app running) | No percept — the listener only fires on level *changes* | No battery-low reference |
| B3 | Battery drops below 20 % a **second** time in the same session (impossible naturally; simulate via mock) | No second percept (`alreadyReported` flag) | No repeat acknowledgement |
| B4 | Battery below 20 % but charger is **plugged in** | No percept (`isCharging = true` guards) | No battery-low reference |
| B5 | Battery below 20 %, unplug charger | Percept fires (now discharging below threshold) | Empiri notices |
| B6 | Battery drops below 20 % with senses **disabled** | No percept | No battery-low reference |

---

## 5. Cross-Sense Buffer Behaviour

These tests verify the percept buffer rules: only one percept per kind (newest wins), capped at 8 total.

| ID | Scenario | Expected |
|----|---------|---------|
| X1 | Shake twice (second within cooldown), then send | One shake percept sent (cooldown suppressed the second) |
| X2 | Shake, then shake again after cooldown, then send | One shake percept — second overwrites first in the buffer (`pushPercept` deduplicates by kind) |
| X3 | Senses on → message sent | Buffer cleared (`drainPercepts` empties `perceptsRef`) |
| X4 | Plug in charger, shake, send | Both `charging` and `shake` percepts sent together |
| X5 | Toggle senses off, then immediately send | No percepts sent (hard gate in `collectOutgoingPercepts`) |

---

## 6. App Lifecycle — Subscription Safety

| ID | Scenario | Expected |
|----|---------|---------|
| L1 | Enable senses, background app, foreground it, check no duplicate listeners | Accelerometer subscription recreated exactly once; no crash |
| L2 | Toggle senses off while app is backgrounded | No listeners attached when app returns to foreground |
| L3 | Toggle senses off and on rapidly (5 × in 1 second) | No listener leak; no crash; final state reflects last toggle |
| L4 | Foreground app, battery API call takes >1 s, background before it resolves | Battery listeners **not** attached (generation guard fires); accelerometer still works |
| L5 | Sign out with senses on | Senses subscriptions cleaned up with the rest of the context |

---

## QA Results

Fill this table after device testing. Target: at least one iOS device and one Android device.

| ID | iOS result | Android result | Notes |
|----|-----------|---------------|-------|
| P1 | | | |
| P2 | | | |
| P3 | | | |
| D1 | | | |
| D2 | | | |
| D3 | | | |
| D4 | | | |
| D5 | | | |
| S1 | | | |
| S2 | | | |
| S3 | | | |
| S4 | | | |
| S5 | | | |
| S6 | | | |
| S7 | | | |
| C1 | | | |
| C2 | | | |
| C3 | | | |
| C4 | | | |
| C5 | | | |
| B1 | | | |
| B2 | | | |
| B3 | | | |
| B4 | | | |
| B5 | | | |
| B6 | | | |
| X1 | | | |
| X2 | | | |
| X3 | | | |
| X4 | | | |
| X5 | | | |
| L1 | | | |
| L2 | | | |
| L3 | | | |
| L4 | | | |
| L5 | | | |

---

## Known constraints

- **Web build:** Only `daypart` percepts are sent (no accelerometer or battery API available in the browser). This is by design — `collectOutgoingPercepts` short-circuits to `[ambient]` when `isWeb` is true.
- **Battery simulator (iOS Simulator):** The iOS Simulator does not provide real battery events. Use a physical device for all battery tests (B1–B6) and charging tests (C1–C5).
- **Accelerometer simulator:** The iOS Simulator has a shake gesture (Device → Shake) but the resulting acceleration values may be lower than the 2.2 g threshold. Use a physical device for definitive shake tests.
- **Android permissions:** `expo-battery` does not require a runtime permission on Android. The accelerometer also requires no permission on either platform.
