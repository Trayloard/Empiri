import type { CompanionSelfSnapshot, CompanionTrait } from "@workspace/api-client-react";

/**
 * Turning a stored self-snapshot into the little human-readable pieces the
 * evolution timeline shows: the dominant traits of that moment and one short
 * generated sentence describing how Empiri felt back then.
 *
 * Everything here is deterministic (no model call): the snapshot already
 * carries the numbers, and a templated sentence keeps the timeline instant,
 * offline-friendly, and stable across re-renders.
 */

/** Friendly adjective for each known trait key (mirrors the server's persona wording). */
const TRAIT_ADJECTIVE: Record<string, string> = {
  warmth: "warm",
  playfulness: "playful",
  curiosity: "curious",
  openness: "open-minded",
  calm: "calm and grounded",
};

/** Display label for a trait chip (falls back to the raw key, capitalised). */
export function traitLabel(key: string): string {
  const label = TRAIT_ADJECTIVE[key] ?? key;
  return label.charAt(0).toUpperCase() + label.slice(1);
}

/**
 * The snapshot's dominant traits: the strongest few, sorted by value.
 * Ties keep a stable order (by key) so the chips never jitter between renders.
 */
export function dominantTraits(
  traits: CompanionTrait[],
  count = 3,
): CompanionTrait[] {
  return [...traits]
    .sort((a, b) => b.value - a.value || a.key.localeCompare(b.key))
    .slice(0, count);
}

function adjective(key: string): string {
  return TRAIT_ADJECTIVE[key] ?? key;
}

/**
 * One short generated sentence about the self's state at snapshot time,
 * e.g. "Feeling especially warm and curious, drawn to Astronomy."
 */
export function describeSnapshot(snapshot: CompanionSelfSnapshot): string {
  const top = dominantTraits(snapshot.traits, 2);
  const topInterest = [...snapshot.interests].sort(
    (a, b) => b.affinity - a.affinity,
  )[0];

  if (top.length === 0) {
    return "Just beginning to take shape.";
  }

  const traitPhrase =
    top.length === 1
      ? adjective(top[0].key)
      : `${adjective(top[0].key)} and ${adjective(top[1].key)}`;

  const interestPhrase =
    topInterest && topInterest.affinity > 0
      ? `, drawn to ${topInterest.display || topInterest.topic}`
      : "";

  return `Feeling especially ${traitPhrase}${interestPhrase}.`;
}

/** Human-friendly date for a timeline entry, e.g. "July 20, 2026". */
export function formatSnapshotDate(capturedAt: string): string {
  const date = new Date(capturedAt);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString(undefined, {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}
