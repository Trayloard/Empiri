/**
 * The single gate deciding whether Empiri may proactively reach out right
 * now: enough quiet time must have passed for the chosen cadence AND the
 * current moment must be outside the user's quiet hours. Extracted into a
 * pure function so the suppression rules stay testable in isolation from the
 * React context that invokes them.
 */

import { shouldCheckIn, type CheckInCadence, type CompanionMoodState } from "./mood";
import { isInQuietHours, type QuietHours } from "./quietHours";

export function shouldProactivelyCheckIn(
  state: CompanionMoodState,
  cadence: CheckInCadence,
  quiet: QuietHours,
  now: number = Date.now(),
): boolean {
  return shouldCheckIn(state, cadence, now) && !isInQuietHours(quiet, now);
}
