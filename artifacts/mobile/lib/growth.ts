/**
 * Pure helpers behind the InnerSelfSheet "GROWTH" view.
 *
 * The server snapshots Empiri's inner self every so often; this module turns
 * that raw timeline (plus the live "now" reading) into the shapes the view
 * draws: trait series, first-seen curiosities, and tiny SVG sparkline paths.
 * Kept side-effect free so it can be unit tested without React or the network.
 */
import type {
  CompanionSelf,
  CompanionSelfSnapshot,
} from "@workspace/api-client-react";

export interface TimelinePoint {
  /** epoch milliseconds */
  at: number;
  /** true for the synthetic live "now" reading appended at the end */
  isNow: boolean;
  interactions: number;
  traits: Record<string, number>;
  interests: { topic: string; affinity: number }[];
}

export interface CuriosityFirstSeen {
  topic: string;
  /** when this topic first showed up in the timeline */
  at: number;
  /** its most recent affinity */
  affinity: number;
  isNow: boolean;
}

export interface TraitSeries {
  key: string;
  values: number[];
}

function traitMap(
  traits: { key: string; value: number }[],
): Record<string, number> {
  const m: Record<string, number> = {};
  for (const t of traits) m[t.key] = t.value;
  return m;
}

/**
 * Merge stored snapshots (oldest→newest) with the live self appended as a final
 * "now" point, so even a single stored snapshot yields a drawable 2-point line.
 */
export function buildTimeline(
  snapshots: CompanionSelfSnapshot[],
  live: CompanionSelf | null,
  now: number = Date.now(),
): TimelinePoint[] {
  const points: TimelinePoint[] = snapshots
    .map((s) => ({
      at: new Date(s.capturedAt).getTime(),
      isNow: false,
      interactions: s.interactions,
      traits: traitMap(s.traits),
      interests: s.interests.map((i) => ({
        topic: i.topic,
        affinity: i.affinity,
      })),
    }))
    .filter((p) => Number.isFinite(p.at))
    .sort((a, b) => a.at - b.at);

  if (live) {
    points.push({
      at: now,
      isNow: true,
      interactions: live.interactions,
      traits: traitMap(live.traits),
      interests: live.interests.map((i) => ({
        topic: i.topic,
        affinity: i.affinity,
      })),
    });
  }
  return points;
}

/** Extract one numeric series per requested trait key (missing → 0). */
export function traitSeries(
  points: TimelinePoint[],
  keys: string[],
): TraitSeries[] {
  return keys.map((key) => ({
    key,
    values: points.map((p) => p.traits[key] ?? 0),
  }));
}

/**
 * For each curiosity, the moment it first appeared in the timeline (earliest
 * point wins) carrying its latest affinity. Sorted most-recent-first so newly
 * emerged interests surface at the top.
 */
export function firstSeenCuriosities(
  points: TimelinePoint[],
): CuriosityFirstSeen[] {
  const seen = new Map<string, CuriosityFirstSeen>();
  for (const p of points) {
    for (const it of p.interests) {
      const existing = seen.get(it.topic);
      if (!existing) {
        seen.set(it.topic, {
          topic: it.topic,
          at: p.at,
          affinity: it.affinity,
          isNow: p.isNow,
        });
      } else {
        // Points arrive oldest→newest, so first-seen `at` is already correct;
        // keep refreshing affinity to the most recent value.
        existing.affinity = it.affinity;
      }
    }
  }
  return [...seen.values()].sort((a, b) => b.at - a.at);
}

/** Build an SVG polyline `d` for a sparkline over the given box. */
export function sparklinePath(
  values: number[],
  width: number,
  height: number,
  opts: { min?: number; max?: number; pad?: number } = {},
): string {
  if (values.length === 0) return "";
  const pad = opts.pad ?? 2;
  const min = opts.min ?? 0;
  const max = opts.max ?? 100;
  const span = max - min || 1;
  const innerH = Math.max(1, height - pad * 2);
  const n = values.length;
  const y = (v: number) => {
    const t = Math.max(0, Math.min(1, (v - min) / span));
    return pad + (1 - t) * innerH;
  };
  if (n === 1) {
    // A flat segment keeps a lone reading visible instead of an empty box.
    return `M 0 ${y(values[0]).toFixed(2)} L ${width} ${y(values[0]).toFixed(2)}`;
  }
  const x = (i: number) => (i / (n - 1)) * width;
  let d = `M ${x(0).toFixed(2)} ${y(values[0]).toFixed(2)}`;
  for (let i = 1; i < n; i++) {
    d += ` L ${x(i).toFixed(2)} ${y(values[i]).toFixed(2)}`;
  }
  return d;
}

/** Human, gentle relative time for when a curiosity first surfaced. */
export function relativeWhen(
  at: number,
  isNow: boolean,
  now: number = Date.now(),
): string {
  if (isNow) return "just now";
  const diff = Math.max(0, now - at);
  const min = 60 * 1000;
  const hour = 60 * min;
  const day = 24 * hour;
  const week = 7 * day;
  if (diff < hour) return "just now";
  if (diff < day) {
    const h = Math.round(diff / hour);
    return h <= 1 ? "an hour ago" : `${h} hours ago`;
  }
  if (diff < week) {
    const d = Math.round(diff / day);
    return d <= 1 ? "yesterday" : `${d} days ago`;
  }
  const w = Math.round(diff / week);
  return w <= 1 ? "a week ago" : `${w} weeks ago`;
}
