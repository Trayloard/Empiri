/**
 * The proactive check-in gate — the one place that decides whether Empiri may
 * greet first. Covers the two suppression rules the reflection feature also
 * leans on: the cadence threshold and quiet hours ("Ruhezeiten-Respekt").
 */

import { shouldProactivelyCheckIn } from "../checkInGate";
import { DEFAULT_CADENCE, type CompanionMoodState } from "../mood";
import { DEFAULT_QUIET_HOURS, type QuietHours } from "../quietHours";

const HOUR = 60 * 60 * 1000;

// Fixed moment: noon local time, so the overnight window below excludes it.
const NOW = new Date(2026, 6, 20, 12, 0, 0).getTime();

function stateAgo(hours: number): CompanionMoodState {
  return { baseMood: 70, baseEnergy: 70, lastInteraction: NOW - hours * HOUR };
}

/** An enabled quiet window that CONTAINS noon (9am–5pm). */
const quietNow: QuietHours = { enabled: true, startMinutes: 9 * 60, endMinutes: 17 * 60 };
/** An enabled overnight window that does NOT contain noon (10pm–8am). */
const quietTonight: QuietHours = { enabled: true, startMinutes: 22 * 60, endMinutes: 8 * 60 };

describe("shouldProactivelyCheckIn", () => {
  it("fires after enough quiet time when outside quiet hours", () => {
    expect(shouldProactivelyCheckIn(stateAgo(8), DEFAULT_CADENCE, quietTonight, NOW)).toBe(true);
    expect(shouldProactivelyCheckIn(stateAgo(8), DEFAULT_CADENCE, DEFAULT_QUIET_HOURS, NOW)).toBe(
      true,
    );
  });

  it("stays silent below the cadence threshold", () => {
    expect(shouldProactivelyCheckIn(stateAgo(2), DEFAULT_CADENCE, quietTonight, NOW)).toBe(false);
  });

  it("is suppressed during quiet hours even after a long absence", () => {
    // 30 hours away — every cadence threshold long passed — but it's quiet time.
    expect(shouldProactivelyCheckIn(stateAgo(30), DEFAULT_CADENCE, quietNow, NOW)).toBe(false);
    expect(shouldProactivelyCheckIn(stateAgo(30), "daily", quietNow, NOW)).toBe(false);
  });

  it("ignores a disabled quiet window", () => {
    const disabled: QuietHours = { ...quietNow, enabled: false };
    expect(shouldProactivelyCheckIn(stateAgo(30), DEFAULT_CADENCE, disabled, NOW)).toBe(true);
  });

  it("never fires when the cadence is off, quiet hours or not", () => {
    expect(shouldProactivelyCheckIn(stateAgo(1000), "off", quietTonight, NOW)).toBe(false);
  });
});
