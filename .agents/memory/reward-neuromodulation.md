---
name: Reward-Center neuromodulation
description: How Empiri's reward block modulates drives and why the neutral invariant matters
---

The reward block (lib/neurobrane, block id "reward") never writes drives directly: the runtime injects its learned synaptic weights as `signal.driveGains`, and the drives block multiplies `satisfyGain` by them.

**Why:** keeps a hard neutral invariant — with all weights at 1 (or the block disabled) drive evolution is bit-identical to the pre-reward behavior, so the layer can be tuned or disabled without migrations.

**How to apply:**
- Any new modulation layer should follow the same pattern: ride on the signal as multipliers with a neutral default of 1, never mutate other blocks' data.
- The reward loop must skip non-`message` folds (percept check-ins read as constant low stimulus and would be punished as "failure").
- Voice exchanges are marked via the API `channel: "voice"` field → `signal.voice`; the warmth factor lives in `params.reward.voiceStimulusWeight`, never hardcoded.
- No UI surface by design: `summarize()` is empty; reward shows only through drive dynamics and persona pacing at clearly high/low levels.
