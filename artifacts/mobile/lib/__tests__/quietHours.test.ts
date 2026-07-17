import {
  adjustNudgeHoursForQuietHours,
  DEFAULT_QUIET_HOURS,
  formatQuietTime,
  isInQuietHours,
  parseQuietHours,
  stepQuietTime,
  type QuietHours,
} from "../quietHours";

/** Build an epoch ms for today at the given local hour/minute. */
function at(hour: number, minute = 0): number {
  const d = new Date(2026, 6, 17, hour, minute, 0, 0);
  return d.getTime();
}

const overnight: QuietHours = {
  enabled: true,
  startMinutes: 22 * 60, // 10pm
  endMinutes: 8 * 60, // 8am
};

const daytime: QuietHours = {
  enabled: true,
  startMinutes: 9 * 60, // 9am
  endMinutes: 17 * 60, // 5pm
};

describe("isInQuietHours", () => {
  it("is always false when disabled", () => {
    expect(isInQuietHours({ ...overnight, enabled: false }, at(23))).toBe(false);
    expect(isInQuietHours(DEFAULT_QUIET_HOURS, at(23))).toBe(false);
  });

  it("matches inside an overnight window across midnight", () => {
    expect(isInQuietHours(overnight, at(23))).toBe(true);
    expect(isInQuietHours(overnight, at(2))).toBe(true);
    expect(isInQuietHours(overnight, at(7, 59))).toBe(true);
  });

  it("does not match outside the overnight window", () => {
    expect(isInQuietHours(overnight, at(8))).toBe(false); // end is exclusive
    expect(isInQuietHours(overnight, at(12))).toBe(false);
    expect(isInQuietHours(overnight, at(21, 59))).toBe(false);
  });

  it("treats the start as inclusive", () => {
    expect(isInQuietHours(overnight, at(22, 0))).toBe(true);
    expect(isInQuietHours(daytime, at(9, 0))).toBe(true);
  });

  it("handles a same-day window", () => {
    expect(isInQuietHours(daytime, at(12))).toBe(true);
    expect(isInQuietHours(daytime, at(8, 59))).toBe(false);
    expect(isInQuietHours(daytime, at(17))).toBe(false);
  });

  it("never matches a zero-length window", () => {
    const zero: QuietHours = { enabled: true, startMinutes: 600, endMinutes: 600 };
    expect(isInQuietHours(zero, at(10))).toBe(false);
    expect(isInQuietHours(zero, at(22))).toBe(false);
  });
});

describe("adjustNudgeHoursForQuietHours", () => {
  it("leaves the delay unchanged when the fire time is outside the window", () => {
    // Now 10am, nudge in 6h → fires 4pm, outside 10pm-8am.
    expect(adjustNudgeHoursForQuietHours(overnight, 6, at(10))).toBe(6);
  });

  it("pushes a nudge landing inside the window to the window end", () => {
    // Now 8pm, nudge in 6h → would fire 2am; push to 8am = 12h from now.
    const adjusted = adjustNudgeHoursForQuietHours(overnight, 6, at(20));
    const fireAt = at(20) + adjusted * 3600 * 1000;
    expect(isInQuietHours(overnight, fireAt)).toBe(false);
    expect(adjusted).toBeCloseTo(12, 3);
  });

  it("wraps past midnight correctly for a fire time before midnight", () => {
    // Now 9pm, nudge in 2h → would fire 11pm; push to 8am next day = 11h.
    const adjusted = adjustNudgeHoursForQuietHours(overnight, 2, at(21));
    expect(adjusted).toBeCloseTo(11, 3);
  });

  it("does nothing when the window is disabled", () => {
    expect(
      adjustNudgeHoursForQuietHours({ ...overnight, enabled: false }, 6, at(20)),
    ).toBe(6);
  });
});

describe("parseQuietHours", () => {
  it("round-trips a valid value", () => {
    expect(parseQuietHours(JSON.stringify(overnight))).toEqual(overnight);
  });

  it("rejects garbage and missing fields", () => {
    expect(parseQuietHours(null)).toBeNull();
    expect(parseQuietHours("not json")).toBeNull();
    expect(parseQuietHours(JSON.stringify({ enabled: true }))).toBeNull();
  });

  it("wraps out-of-range minutes back into a day", () => {
    const parsed = parseQuietHours(
      JSON.stringify({ enabled: true, startMinutes: 1500, endMinutes: -60 }),
    );
    expect(parsed).toEqual({ enabled: true, startMinutes: 60, endMinutes: 1380 });
  });
});

describe("formatQuietTime / stepQuietTime", () => {
  it("formats 12-hour labels", () => {
    expect(formatQuietTime(0)).toBe("12:00 AM");
    expect(formatQuietTime(8 * 60)).toBe("8:00 AM");
    expect(formatQuietTime(12 * 60)).toBe("12:00 PM");
    expect(formatQuietTime(22 * 60 + 30)).toBe("10:30 PM");
  });

  it("steps in 30-minute increments and wraps at midnight", () => {
    expect(stepQuietTime(0, -1)).toBe(23 * 60 + 30);
    expect(stepQuietTime(23 * 60 + 30, 1)).toBe(0);
    expect(stepQuietTime(600, 1)).toBe(630);
  });
});
