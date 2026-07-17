/**
 * Quiet hours — a do-not-disturb window for Empiri's proactive check-ins.
 *
 * The user picks a start and end time (minutes since midnight). While the
 * current time falls inside the window, Empiri suppresses both the in-app
 * proactive greeting and the scheduled notification nudge. Windows may wrap
 * past midnight (e.g. 22:00 → 08:00). Everything here is a pure function of
 * the clock so it stays deterministic and easy to test.
 */

export interface QuietHours {
  /** Whether the window is active at all. */
  enabled: boolean;
  /** Window start, minutes since midnight (0-1439). */
  startMinutes: number;
  /** Window end, minutes since midnight (0-1439). */
  endMinutes: number;
}

const MINUTES_PER_DAY = 24 * 60;

/** The default window shown when the user first enables quiet hours: 10pm–8am. */
export const DEFAULT_QUIET_HOURS: QuietHours = {
  enabled: false,
  startMinutes: 22 * 60,
  endMinutes: 8 * 60,
};

function clampMinutes(value: number): number {
  const wrapped = ((Math.round(value) % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY;
  return wrapped;
}

/** Parse a persisted JSON blob back into a QuietHours, or null if invalid. */
export function parseQuietHours(raw: string | null): QuietHours | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<QuietHours>;
    if (
      typeof parsed.enabled === "boolean" &&
      typeof parsed.startMinutes === "number" &&
      typeof parsed.endMinutes === "number"
    ) {
      return {
        enabled: parsed.enabled,
        startMinutes: clampMinutes(parsed.startMinutes),
        endMinutes: clampMinutes(parsed.endMinutes),
      };
    }
  } catch {
    // fall through
  }
  return null;
}

/** Minutes since local midnight for a given moment. */
function minutesOfDay(at: Date): number {
  return at.getHours() * 60 + at.getMinutes();
}

/**
 * Whether `now` falls inside the quiet-hours window. A disabled window or a
 * zero-length window (start === end) never matches. Overnight windows
 * (start > end) wrap past midnight.
 */
export function isInQuietHours(
  quiet: QuietHours,
  now: number = Date.now(),
): boolean {
  if (!quiet.enabled) return false;
  const start = clampMinutes(quiet.startMinutes);
  const end = clampMinutes(quiet.endMinutes);
  if (start === end) return false;
  const current = minutesOfDay(new Date(now));
  if (start < end) {
    return current >= start && current < end;
  }
  // Overnight wrap: quiet from start → midnight → end.
  return current >= start || current < end;
}

/**
 * Adjust a nudge delay so it never fires inside the quiet-hours window. If the
 * planned fire time (now + afterHours) lands inside the window, the nudge is
 * pushed to the window's end instead. Returns the (possibly increased) delay
 * in hours.
 */
export function adjustNudgeHoursForQuietHours(
  quiet: QuietHours,
  afterHours: number,
  now: number = Date.now(),
): number {
  const fireAt = now + afterHours * 60 * 60 * 1000;
  if (!isInQuietHours(quiet, fireAt)) return afterHours;

  const end = clampMinutes(quiet.endMinutes);
  const fireDate = new Date(fireAt);
  const fireMinutes = minutesOfDay(fireDate);

  // Minutes from the planned fire time until the window ends (same day or
  // after the midnight wrap).
  let minutesUntilEnd = end - fireMinutes;
  if (minutesUntilEnd <= 0) minutesUntilEnd += MINUTES_PER_DAY;

  // Also clear the seconds already elapsed inside the current minute so the
  // nudge lands at (or just after) the window's end, never inside it.
  const secondsIntoMinute =
    fireDate.getSeconds() + fireDate.getMilliseconds() / 1000;
  const extraHours = (minutesUntilEnd * 60 - secondsIntoMinute) / 3600;
  return afterHours + Math.max(0, extraHours);
}

/** Format minutes-since-midnight as a friendly 12-hour label, e.g. "10:00 PM". */
export function formatQuietTime(minutes: number): string {
  const m = clampMinutes(minutes);
  const hours24 = Math.floor(m / 60);
  const mins = m % 60;
  const period = hours24 >= 12 ? "PM" : "AM";
  const hours12 = hours24 % 12 === 0 ? 12 : hours24 % 12;
  return `${hours12}:${String(mins).padStart(2, "0")} ${period}`;
}

/** Step size for the time steppers in the settings sheet. */
export const QUIET_STEP_MINUTES = 30;

/** Step a time value by ±QUIET_STEP_MINUTES, wrapping around midnight. */
export function stepQuietTime(minutes: number, direction: 1 | -1): number {
  return clampMinutes(minutes + direction * QUIET_STEP_MINUTES);
}
