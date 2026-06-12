import {
  cadenceHours,
  CHECK_IN_AFTER_HOURS,
  computeMood,
  DEFAULT_CADENCE,
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

  it("triggers a check-in only after enough quiet time (default cadence)", () => {
    expect(shouldCheckIn(stateAgo(1), DEFAULT_CADENCE, NOW)).toBe(false);
    expect(
      shouldCheckIn(stateAgo(CHECK_IN_AFTER_HOURS + 1), DEFAULT_CADENCE, NOW),
    ).toBe(true);
  });
});

describe("check-in cadence", () => {
  it("maps each cadence to its hours threshold", () => {
    expect(cadenceHours("off")).toBeNull();
    expect(cadenceHours("daily")).toBe(24);
    expect(cadenceHours("frequent")).toBe(6);
    expect(CHECK_IN_AFTER_HOURS).toBe(cadenceHours("frequent"));
  });

  it("never checks in when cadence is off, no matter how long away", () => {
    expect(shouldCheckIn(stateAgo(1000), "off", NOW)).toBe(false);
  });

  it("checks in less often on the daily cadence than the frequent one", () => {
    // 8 hours away: frequent (6h) should fire, daily (24h) should not.
    expect(shouldCheckIn(stateAgo(8), "frequent", NOW)).toBe(true);
    expect(shouldCheckIn(stateAgo(8), "daily", NOW)).toBe(false);
    // A full day away: both fire.
    expect(shouldCheckIn(stateAgo(25), "daily", NOW)).toBe(true);
  });
});
