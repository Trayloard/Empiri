/**
 * Local notification nudges for Empiri.
 *
 * Everything here is best-effort and a no-op on web (where expo-notifications
 * isn't supported). We only ever schedule *local* notifications — no push
 * infrastructure — so the companion can gently nudge the user while the app is
 * closed. Callers gate scheduling on the user's remembered on/off toggle.
 */
import { Platform } from "react-native";
import * as Notifications from "expo-notifications";

const isSupported = Platform.OS !== "web";

let handlerConfigured = false;

function ensureHandler() {
  if (handlerConfigured || !isSupported) return;
  handlerConfigured = true;
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: false,
      shouldSetBadge: false,
    }),
  });
}

/** Ask for notification permission. Returns whether it's granted. */
export async function requestNotificationPermission(): Promise<boolean> {
  if (!isSupported) return false;
  ensureHandler();
  try {
    const current = await Notifications.getPermissionsAsync();
    if (current.granted) return true;
    if (!current.canAskAgain) return false;
    const result = await Notifications.requestPermissionsAsync();
    return result.granted;
  } catch {
    return false;
  }
}

/** Whether notification permission is already granted (no prompt). */
export async function hasNotificationPermission(): Promise<boolean> {
  if (!isSupported) return false;
  try {
    const current = await Notifications.getPermissionsAsync();
    return current.granted;
  } catch {
    return false;
  }
}

/** Remove any pending Empiri nudges. */
export async function cancelNudges(): Promise<void> {
  if (!isSupported) return;
  try {
    await Notifications.cancelAllScheduledNotificationsAsync();
  } catch {
    // best-effort
  }
}

/**
 * Schedule a single nudge `seconds` from now. Cancels any previously scheduled
 * one first so we never stack duplicates. Shared by the real cadence nudge and
 * the dev-only "soon" shortcut.
 */
async function scheduleNudgeAfterSeconds(
  body: string,
  seconds: number,
  title: string,
): Promise<void> {
  if (!isSupported) return;
  ensureHandler();
  try {
    if (!(await hasNotificationPermission())) return;
    await cancelNudges();
    await Notifications.scheduleNotificationAsync({
      content: { title, body },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
        seconds,
      },
    });
  } catch {
    // best-effort
  }
}

/**
 * Schedule a single "miss you" nudge `afterHours` from now. We never schedule
 * sooner than a minute in production so the nudge stays a gentle "miss you",
 * not a buzz moments after the user leaves.
 */
export async function scheduleNudge(
  body: string,
  afterHours: number,
  title = "Empiri",
): Promise<void> {
  await scheduleNudgeAfterSeconds(
    body,
    Math.max(60, Math.round(afterHours * 3600)),
    title,
  );
}

/** Seconds out for the dev-only "nudge soon" QA shortcut. */
export const DEV_NUDGE_SECONDS = 5;

/**
 * DEV-ONLY: schedule a nudge a few seconds out so the notification path can be
 * verified on-device without waiting hours. Bypasses the production 60s floor.
 * Only ever reached from `__DEV__`-gated callers, so it never fires in
 * production builds.
 */
export async function scheduleNudgeInSeconds(
  body: string,
  seconds: number = DEV_NUDGE_SECONDS,
  title = "Empiri",
): Promise<void> {
  // Defense-in-depth: even if a future caller forgets to gate this, it must
  // never bypass the production 60s floor outside dev builds.
  if (!__DEV__) return;
  await scheduleNudgeAfterSeconds(body, Math.max(1, Math.round(seconds)), title);
}
