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
  "talk", "talking", "talked", "said", "says", "saying", "love", "loved", "need",
  "needed",
  // English generic action verbs (base/3rd-person forms; -ing/-ed/-ly forms are
  // caught by the morphology penalty in extractTopics rather than listed here).
  "keep", "keeps", "make", "makes", "take", "takes", "give", "gives", "come",
  "comes", "find", "finds", "look", "looks", "seem", "seems", "over",
  "fascinate", "fascinates",
  // German structural / fillers
  "oder", "aber", "auch", "noch", "schon", "sehr", "mehr", "dann", "denn",
  "dass", "weil", "wenn", "wenns", "doch", "habe", "haben", "hatte", "hätte",
  "wird", "wirst", "werde", "werden", "sein", "seine", "mein", "meine", "dein",
  "deine", "nicht", "etwas", "immer", "schön", "ganz", "über", "diese", "dieser",
  "total", "wirklich", "vielleicht", "eigentlich", "gerade", "heute", "morgen",
  "gestern", "machen", "gemacht", "reden", "sagen", "gesagt", "finde", "echt",
  "viel", "viele", "nach", "durch", "ohne", "einfach",
]);

// Words that survive the length filter but are generic "filler" nouns or
// nominalized verbs — they read like topics ("form", "idea", "thinking") yet
// name no real subject. Kept apart from STOPWORDS for readability; both sets
// are excluded. This is the class the "growing curiosities" surface most wants
// to drop so that genuine subjects (people, places, themes) shine through.
const GENERIC_TERMS = new Set([
  // English abstract / filler nouns
  "form", "forms", "idea", "ideas", "way", "ways", "part", "parts", "type",
  "types", "sense", "point", "points", "fact", "facts", "case", "cases", "lot",
  "lots", "time", "times", "moment", "moments", "reason", "reasons", "example",
  "examples", "people", "person", "matter", "matters",
  // English nominalized cognition/speech verbs that escape the stopword list
  "thinking", "wondering", "wanting", "trying", "guess", "mean", "means",
  "meaning",
  // German generic nouns / nominalized verbs (nouns are capitalized in German,
  // so these would otherwise be boosted as proper subjects below)
  "sache", "sachen", "ding", "dinge", "weise", "grund", "gründe", "denken",
  "denke", "denkst", "gedanke", "gedanken", "frage", "fragen",
]);

/** True if the token at `index` begins a sentence (so capitalization there is
 * not a proper-noun signal — it's just the start of a clause). */
function isSentenceStart(text: string, index: number): boolean {
  let i = index - 1;
  while (i >= 0 && /\s/.test(text[i]!)) {
    if (text[i] === "\n") return true; // a new line starts a fresh clause
    i -= 1;
  }
  if (i < 0) return true;
  return /[.!?;:]/.test(text[i]!);
}

/**
 * Extract up to `max` candidate topic keywords from a turn of text. Naive and
 * deterministic, but biased toward content: lower-cased letter-words of length
 * >= 4 that are not common filler. Rather than ranking on raw length alone, each
 * candidate is scored so genuine subjects beat noise: a capitalized mid-sentence
 * word is boosted (proper nouns like people/places in English, and ordinary nouns
 * in German, where every noun is capitalized), while words that look like verbs or
 * adverbs by their ending (-ing / -ed / -ly) are softly penalized — softly, so a
 * real interest like "gardening" can still surface when nothing stronger competes.
 * This favours subjects like "astronomy" or "Paris" over fillers like "thinking"
 * or "totally". The reinforcement loop does the rest over time. (A semantic
 * extractor is a deliberate future enhancement.)
 */
export function extractTopics(text: string, max = 2): string[] {
  const source = text ?? "";
  const tokenRe = /[\p{L}\p{N}-]+/gu;
  const scored: { key: string; score: number; order: number }[] = [];
  let match: RegExpExecArray | null;
  let order = 0;

  while ((match = tokenRe.exec(source)) !== null) {
    const original = match[0];
    const key = normalizeTopic(original);
    order += 1;
    // Require real content: long enough, at least one letter/digit (so dash
    // dividers like "----" can't become a topic), and not common filler.
    if (
      key.length < 4 ||
      !/[\p{L}\p{N}]/u.test(key) ||
      STOPWORDS.has(key) ||
      GENERIC_TERMS.has(key)
    ) {
      continue;
    }

    // Content bias, capped so a single very long word can't dwarf a strong
    // proper-noun signal.
    let score = Math.min(key.length, 14);

    // Capitalized words that don't start a sentence are likely real subjects.
    if (/^\p{Lu}/u.test(original) && !isSentenceStart(source, match.index)) {
      score += 6;
    }

    // Verb/adverb-looking endings are demoted but not excluded.
    if (/(?:ing|ed|ly)$/.test(key)) score -= 4;

    scored.push({ key, score, order });
  }

  // Highest score wins; first-occurrence order is the deterministic tiebreak.
  scored.sort((a, b) => b.score - a.score || a.order - b.order);

  const seen = new Set<string>();
  const topics: string[] = [];
  for (const { key } of scored) {
    if (seen.has(key)) continue;
    seen.add(key);
    topics.push(key);
    if (topics.length >= max) break;
  }
  return topics;
}
