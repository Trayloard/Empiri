/**
 * Empiri's inner life — a tiny Tamagotchi-style mood/needs model.
 *
 * The companion has two stats that fade while you're away and lift when you
 * interact (`mood` and `energy`), plus a "missing you" level that grows the
 * longer it's been since you last said hi. Everything is derived from a single
 * persisted snapshot taken at the last interaction, so the current values are a
 * pure function of elapsed time — making it deterministic and easy to test.
 */

export type MoodLabel = "sleepy" | "low" | "content" | "happy" | "bright";

/** Persisted snapshot — the stats *as of* the last interaction. */
export interface CompanionMoodState {
  /** mood right after the last interaction, 0-100 */
  baseMood: number;
  /** energy right after the last interaction, 0-100 */
  baseEnergy: number;
  /** epoch ms of the last interaction */
  lastInteraction: number;
}

/** Live, time-adjusted view of the companion's feelings. */
export interface ComputedMood {
  mood: number;
  energy: number;
  missingYou: number;
  label: MoodLabel;
  hoursAway: number;
}

const HOUR_MS = 60 * 60 * 1000;

// Tuning knobs — chosen so a full day away drains the companion to its floor
// and a check-in clearly perks it back up.
const MOOD_DECAY_PER_HOUR = 4;
const ENERGY_DECAY_PER_HOUR = 5;
const MISSING_GROWTH_PER_HOUR = 8;
const STAT_FLOOR = 5;

const MOOD_BOOST = 30;
const ENERGY_BOOST = 35;

/** Hours of silence after which the companion proactively reaches out. */
export const CHECK_IN_AFTER_HOURS = 6;

function clamp(value: number, min = 0, max = 100): number {
  return Math.min(max, Math.max(min, value));
}

/** A fresh, content companion — used the very first time the app opens. */
export function freshMoodState(now: number = Date.now()): CompanionMoodState {
  return {
    baseMood: 70,
    baseEnergy: 70,
    lastInteraction: now,
  };
}

function labelFor(mood: number, energy: number): MoodLabel {
  // Very low energy reads as sleepy regardless of mood.
  if (energy < 20) return "sleepy";
  const wellbeing = (mood + energy) / 2;
  if (wellbeing >= 75) return "bright";
  if (wellbeing >= 55) return "happy";
  if (wellbeing >= 35) return "content";
  if (wellbeing >= 20) return "low";
  return "sleepy";
}

/** Project the persisted snapshot forward to `now`. */
export function computeMood(
  state: CompanionMoodState,
  now: number = Date.now(),
): ComputedMood {
  const hoursAway = Math.max(0, (now - state.lastInteraction) / HOUR_MS);

  const mood = clamp(state.baseMood - MOOD_DECAY_PER_HOUR * hoursAway, STAT_FLOOR);
  const energy = clamp(
    state.baseEnergy - ENERGY_DECAY_PER_HOUR * hoursAway,
    STAT_FLOOR,
  );
  const missingYou = clamp(MISSING_GROWTH_PER_HOUR * hoursAway, 0, 100);

  return {
    mood: Math.round(mood),
    energy: Math.round(energy),
    missingYou: Math.round(missingYou),
    label: labelFor(mood, energy),
    hoursAway,
  };
}

/**
 * Record an interaction: the companion perks up and the "missing you" clock
 * resets. Returns a new snapshot anchored at `now`.
 */
export function registerInteraction(
  state: CompanionMoodState,
  now: number = Date.now(),
): CompanionMoodState {
  const current = computeMood(state, now);
  return {
    baseMood: clamp(current.mood + MOOD_BOOST),
    baseEnergy: clamp(current.energy + ENERGY_BOOST),
    lastInteraction: now,
  };
}

/** Whether enough time has passed to warrant a proactive check-in. */
export function shouldCheckIn(
  state: CompanionMoodState,
  now: number = Date.now(),
): boolean {
  return (now - state.lastInteraction) / HOUR_MS >= CHECK_IN_AFTER_HOURS;
}

/** A short, human description of the mood for prompts/UI copy. */
export function moodDescription(label: MoodLabel): string {
  switch (label) {
    case "bright":
      return "bright and bubbly";
    case "happy":
      return "happy and content";
    case "content":
      return "calm and steady";
    case "low":
      return "a little low and quiet";
    case "sleepy":
      return "sleepy and faded";
  }
}
