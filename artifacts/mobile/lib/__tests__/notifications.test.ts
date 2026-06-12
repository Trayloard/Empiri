import * as Notifications from "expo-notifications";

import {
  DEV_NUDGE_SECONDS,
  scheduleNudge,
  scheduleNudgeInSeconds,
} from "../notifications";

// expo-notifications pulls in native modules; stub the bits we touch.
jest.mock("expo-notifications", () => ({
  setNotificationHandler: jest.fn(),
  getPermissionsAsync: jest.fn().mockResolvedValue({ granted: true }),
  requestPermissionsAsync: jest.fn().mockResolvedValue({ granted: true }),
  cancelAllScheduledNotificationsAsync: jest.fn().mockResolvedValue(undefined),
  scheduleNotificationAsync: jest.fn().mockResolvedValue(undefined),
  SchedulableTriggerInputTypes: { TIME_INTERVAL: "timeInterval" },
}));

const mockSchedule = Notifications.scheduleNotificationAsync as jest.Mock;
const mockCancel =
  Notifications.cancelAllScheduledNotificationsAsync as jest.Mock;
const mockGetPermissions = Notifications.getPermissionsAsync as jest.Mock;

/** The `seconds` value handed to the OS on the first schedule call. */
function scheduledSeconds(): number {
  const arg = mockSchedule.mock.calls[0][0] as {
    trigger: { seconds: number };
  };
  return arg.trigger.seconds;
}

beforeEach(() => {
  jest.clearAllMocks();
  // clearAllMocks keeps implementations, but a prior test may have flipped this.
  mockGetPermissions.mockResolvedValue({ granted: true });
});

describe("scheduleNudge (production cadence)", () => {
  it("never schedules sooner than 60 seconds, even for a 0-hour request", async () => {
    await scheduleNudge("miss you", 0);
    expect(mockCancel).toHaveBeenCalledTimes(1);
    expect(scheduledSeconds()).toBe(60);
  });

  it("converts hours to seconds for a normal cadence", async () => {
    await scheduleNudge("miss you", 6);
    expect(scheduledSeconds()).toBe(6 * 3600);
  });
});

describe("scheduleNudgeInSeconds (dev-only shortcut)", () => {
  it("schedules a nudge seconds out, bypassing the 60s production floor", async () => {
    await scheduleNudgeInSeconds("miss you", 5);
    expect(mockCancel).toHaveBeenCalledTimes(1);
    expect(scheduledSeconds()).toBe(5);
  });

  it("defaults to DEV_NUDGE_SECONDS when no delay is given", async () => {
    await scheduleNudgeInSeconds("miss you");
    expect(scheduledSeconds()).toBe(DEV_NUDGE_SECONDS);
  });

  it("clamps to a 1-second minimum", async () => {
    await scheduleNudgeInSeconds("miss you", 0);
    expect(scheduledSeconds()).toBe(1);
  });

  it("does nothing without notification permission", async () => {
    mockGetPermissions.mockResolvedValue({ granted: false });
    await scheduleNudgeInSeconds("miss you", 5);
    expect(mockSchedule).not.toHaveBeenCalled();
  });
});

describe("scheduleNudgeInSeconds (production guard)", () => {
  // In a production build Metro sets __DEV__=false and tree-shakes the callers,
  // but this guard is the last line of defence inside the function itself: even
  // if a caller forgets its own gate, the 60s production floor can never be
  // bypassed in a release build.
  it("is a complete no-op when __DEV__ is false, so the 60s production floor is never bypassable", async () => {
    const original = (global as any).__DEV__;
    (global as any).__DEV__ = false;
    try {
      await scheduleNudgeInSeconds("miss you", 5);
      expect(mockSchedule).not.toHaveBeenCalled();
      expect(mockCancel).not.toHaveBeenCalled();
    } finally {
      (global as any).__DEV__ = original;
    }
  });
});
