import {
  CHECK_IN_AFTER_HOURS,
  computeMood,
  freshMoodState,
  registerInteraction,
  shouldCheckIn,
  type CompanionMoodState,
} from "../mood";

const HOUR = 60 * 60 * 1000;
const NOW = new Date("2026-06-12T12:00:00.000Z").getTime();

function stateAgo(hours: number, base = 100): CompanionMoodState {
  return {
    baseMood: base,
    baseEnergy: base,
    lastInteraction: NOW - hours * HOUR,
  };
}

describe("companion mood drift", () => {
  it("starts fresh and content", () => {
    const fresh = freshMoodState(NOW);
    const mood = computeMood(fresh, NOW);
    expect(mood.mood).toBeGreaterThan(0);
    expect(mood.missingYou).toBe(0);
    expect(["content", "happy"]).toContain(mood.label);
  });

  it("fades toward sleepy after a long absence", () => {
    const mood = computeMood(stateAgo(24), NOW);
    expect(mood.label).toBe("sleepy");
    expect(mood.energy).toBeLessThan(30);
    expect(mood.missingYou).toBe(100);
  });

  it("misses the user more the longer they're away", () => {
    const short = computeMood(stateAgo(1), NOW).missingYou;
    const long = computeMood(stateAgo(5), NOW).missingYou;
    expect(long).toBeGreaterThan(short);
  });

  it("never drops below the floor", () => {
    const mood = computeMood(stateAgo(1000), NOW);
    expect(mood.mood).toBeGreaterThanOrEqual(0);
    expect(mood.energy).toBeGreaterThanOrEqual(0);
    expect(mood.missingYou).toBeLessThanOrEqual(100);
  });

  it("lifts and resets the missing-you clock after an interaction", () => {
    const faded = stateAgo(24);
    const before = computeMood(faded, NOW);

    const lifted = registerInteraction(faded, NOW);
    const after = computeMood(lifted, NOW);

    expect(after.mood).toBeGreaterThan(before.mood);
    expect(after.energy).toBeGreaterThan(before.energy);
    expect(after.missingYou).toBe(0);
    expect(after.hoursAway).toBe(0);
  });

  it("triggers a check-in only after enough quiet time", () => {
    expect(shouldCheckIn(stateAgo(1), NOW)).toBe(false);
    expect(shouldCheckIn(stateAgo(CHECK_IN_AFTER_HOURS + 1), NOW)).toBe(true);
  });
});
