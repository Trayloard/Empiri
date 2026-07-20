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
  interests: { topic: string; affinity: number; display: string }[];
}

export interface CuriosityFirstSeen {
  topic: string;
  /** proper-cased cosmetic label; falls back to the normalized topic key */
  display: string;
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
        display: i.display ?? i.topic,
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
        display: i.display ?? i.topic,
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
          display: it.display,
          at: p.at,
          affinity: it.affinity,
          isNow: p.isNow,
        });
      } else {
        // Points arrive oldest→newest, so first-seen `at` is already correct;
        // keep refreshing affinity (and display casing) to the most recent value.
        existing.affinity = it.affinity;
        existing.display = it.display;
      }
    }
  }
  return [...seen.values()].sort((a, b) => b.at - a.at);
}

/**
 * Normalized x positions (0..1) for each point along a *real* time axis, so a
 * line drawn through them reflects the actual gaps between snapshots rather than
 * even index spacing. Assumes points are oldest→newest (as buildTimeline emits).
 * Degenerate inputs — none, one, or all-identical timestamps — fall back to even
 * spacing so the chart stays drawable.
 */
export function timePositions(points: { at: number }[]): number[] {
  const n = points.length;
  if (n === 0) return [];
  if (n === 1) return [0];
  const first = points[0].at;
  const last = points[n - 1].at;
  const span = last - first;
  if (!(span > 0)) return points.map((_, i) => i / (n - 1));
  return points.map((p) => (p.at - first) / span);
}

/**
 * Index of the timeline point nearest to a touch at normalized x (0..1),
 * given each point's normalized position (as from `timePositions`). The touch
 * x is clamped into range so drags past the chart edges snap to the endpoints.
 * Ties between two equally near points resolve to the later (more recent) one.
 * Returns -1 when there are no positions.
 */
export function nearestTimelineIndex(xNorm: number, xs: number[]): number {
  const n = xs.length;
  if (n === 0) return -1;
  const x = Math.max(0, Math.min(1, xNorm));
  let best = 0;
  let bestDist = Math.abs(xs[0] - x);
  for (let i = 1; i < n; i++) {
    const d = Math.abs(xs[i] - x);
    if (d <= bestDist) {
      best = i;
      bestDist = d;
    }
  }
  return best;
}

/**
 * Build an SVG polyline `d` for a sparkline over the given box. When `xs`
 * (normalized 0..1 positions, one per value) is supplied the points honor a real
 * time axis; otherwise they are spaced evenly by index.
 */
export function sparklinePath(
  values: number[],
  width: number,
  height: number,
  opts: { min?: number; max?: number; pad?: number; xs?: number[] } = {},
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
  const xsNorm = opts.xs && opts.xs.length === n ? opts.xs : null;
  const x = (i: number) =>
    (xsNorm ? Math.max(0, Math.min(1, xsNorm[i])) : i / (n - 1)) * width;
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

const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

/**
 * Short, light label for a moment on the time axis: "today" for the current day,
 * otherwise a compact calendar date like "Jun 5". Uses the device's local time
 * since that's how the user reads the timeline.
 */
export function axisDateLabel(at: number, now: number = Date.now()): string {
  const d = new Date(at);
  const today = new Date(now);
  if (
    d.getFullYear() === today.getFullYear() &&
    d.getMonth() === today.getMonth() &&
    d.getDate() === today.getDate()
  ) {
    return "today";
  }
  return `${MONTHS[d.getMonth()]} ${d.getDate()}`;
}

/**
 * Human period label for a chapter of the shared story: "Jul 2026" when it
 * falls inside one month, "Jul – Sep 2026" across months, and
 * "Dec 2026 – Jan 2027" across years. Local time, like the rest of the sheet.
 */
export function chapterPeriodLabel(from: number, to: number): string {
  const a = new Date(Math.min(from, to));
  const b = new Date(Math.max(from, to));
  const sameYear = a.getFullYear() === b.getFullYear();
  if (sameYear && a.getMonth() === b.getMonth()) {
    return `${MONTHS[a.getMonth()]} ${a.getFullYear()}`;
  }
  if (sameYear) {
    return `${MONTHS[a.getMonth()]} – ${MONTHS[b.getMonth()]} ${a.getFullYear()}`;
  }
  return `${MONTHS[a.getMonth()]} ${a.getFullYear()} – ${MONTHS[b.getMonth()]} ${b.getFullYear()}`;
}

export interface AxisTick {
  /** normalized 0..1 position along the time axis */
  pos: number;
  label: string;
}

/**
 * Light endpoint labels for the time axis: the oldest point on the left and the
 * present on the right ("now" when the live reading is included). Empty until
 * there are at least two points to span.
 */
export function timeAxisTicks(
  points: { at: number; isNow: boolean }[],
  now: number = Date.now(),
): AxisTick[] {
  if (points.length < 2) return [];
  const first = points[0];
  const last = points[points.length - 1];
  return [
    { pos: 0, label: axisDateLabel(first.at, now) },
    { pos: 1, label: last.isNow ? "now" : axisDateLabel(last.at, now) },
  ];
}
