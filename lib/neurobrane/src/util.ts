/** Small, dependency-free helpers shared across the inner-self logic. */

/** Clamp a number into [min, max]; NaN collapses to `min` for safety. */
export function clamp(value: number, min: number, max: number): number {
  if (Number.isNaN(value)) return min;
  return Math.max(min, Math.min(max, value));
}

/** Convert an elapsed duration in ms to a non-negative number of hours. */
export function hoursBetween(elapsedMs: number): number {
  return Math.max(0, elapsedMs) / 3_600_000;
}

/** Round to one decimal place (for friendly summary values). */
export function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

/** Join phrases with natural English conjunctions: "a", "a and b", "a, b and c". */
export function joinNatural(parts: string[]): string {
  const items = parts.filter(Boolean);
  if (items.length === 0) return "";
  if (items.length === 1) return items[0];
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

/** Normalize a raw topic word into a stable, comparable key. */
export function normalizeTopic(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, "")
    .trim()
    .replace(/\s+/g, " ");
}

// Common English + German filler words that never make meaningful interests.
// Includes intensifiers, generic verbs/adjectives, and time words that would
// otherwise masquerade as topics (e.g. "totally", "fascinated", "amazing").
const STOPWORDS = new Set([
  // English structural / pronouns
  "about", "above", "after", "again", "against", "their", "there", "these",
  "thing", "things", "stuff", "would", "could", "should", "where", "which",
  "while", "with", "your", "yours", "youre", "that", "this", "have", "from",
  "they", "them", "then", "than", "what", "when", "were", "been", "being",
  "just", "like", "into", "much", "very", "some", "also", "only", "even",
  "more", "most", "such", "here", "they", "ours", "mine", "this", "those",
  // English intensifiers / fillers / generic adjectives
  "really", "totally", "amazing", "amazingly", "awesome", "fascinated",
  "fascinating", "interesting", "something", "anything", "everything", "nothing",
  "someone", "anyone", "everyone", "maybe", "perhaps", "please", "thanks",
  "thank", "today", "tomorrow", "yesterday", "tonight", "always", "never",
  "sometimes", "often", "lately", "recently", "actually", "basically",
  "literally", "honestly", "going", "doing", "making", "getting", "looking",
  "feeling", "good", "great", "nice", "cool", "lovely", "loveliest", "pretty",
  "super", "quite", "still", "around", "kind", "kinda", "sort", "sorta",
  // English generic verbs of speech / cognition
  "want", "wanted", "know", "knew", "think", "thought", "feel", "tell", "told",
  "talk", "talking", "said", "says", "saying", "love", "loved", "need", "needed",
  // German structural / fillers
  "oder", "aber", "auch", "noch", "schon", "sehr", "mehr", "dann", "denn",
  "dass", "weil", "wenn", "wenns", "doch", "habe", "haben", "hatte", "hätte",
  "wird", "wirst", "werde", "werden", "sein", "seine", "mein", "meine", "dein",
  "deine", "nicht", "etwas", "immer", "schön", "ganz", "über", "diese", "dieser",
  "total", "wirklich", "vielleicht", "eigentlich", "gerade", "heute", "morgen",
  "gestern", "machen", "gemacht", "reden", "sagen", "gesagt", "finde", "echt",
]);

/**
 * Extract up to `max` candidate topic keywords from a turn of text. Naive and
 * deterministic, but biased toward content: lower-cased letter-words of length
 * >= 4 that are not common filler, preferring longer (more content-bearing)
 * words, with first-occurrence order as the tiebreak. This favours nouns like
 * "astronomy" over fillers like "totally". The reinforcement loop does the rest
 * over time. (A semantic extractor is a deliberate future enhancement.)
 */
export function extractTopics(text: string, max = 2): string[] {
  const candidates = text
    .toLowerCase()
    .split(/[^\p{L}\p{N}-]+/u)
    .map((w, index) => ({ word: w.trim(), index }))
    .filter((c) => c.word.length >= 4 && !STOPWORDS.has(c.word));

  // Prefer longer words; keep first-occurrence order as the tiebreak.
  candidates.sort((a, b) => b.word.length - a.word.length || a.index - b.index);

  const seen = new Set<string>();
  const topics: string[] = [];
  for (const { word } of candidates) {
    if (seen.has(word)) continue;
    seen.add(word);
    topics.push(word);
    if (topics.length >= max) break;
  }
  return topics;
}
