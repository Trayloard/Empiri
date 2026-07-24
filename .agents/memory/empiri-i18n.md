---
name: Empiri i18n pattern
description: How device-language localization works in the Empiri mobile app and API — where strings live and how AI reply language is set.
---

- UI strings: `artifacts/mobile/lib/i18n.ts` — `t(key, params?)`, flat dotted keys ("innerSelf.mindSub"), `{param}` interpolation. English table `en` is key source of truth; `de` is typed `Record<Key, string>` so parity is compiler-enforced. German devices get `de`, everything else falls back to English. Brand "Empiri", testIDs, logs stay untranslated.
- Module-scope label tables must hold functions returning `t(...)` (call-time evaluation), invoked at call sites e.g. `MODE_LABEL[m]()` — otherwise strings freeze at import time.
- AI reply language: mobile sends `locale: deviceLocaleTag` (raw BCP-47) in message/stream/check-in bodies; optional `locale` (maxLength 64) in OpenAPI. Server `buildSystemPrompt` appends `languageDirective()` which regex-validates the tag (injection safety) and maps ~14 languages to a directive.
- Jest resolves to English by default, so existing tests asserting English copy keep passing.

**Why:** any new user-facing string added without a t() key silently ships English-only; any new AI call site without the locale param replies in English.
**How to apply:** when adding mobile UI copy or a new companion LLM call, wire both sides of this pattern.
