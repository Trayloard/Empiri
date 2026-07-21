import { eq } from "drizzle-orm";
import { companionSelves, db, type InterestThemeCache } from "@workspace/db";
import { openai } from "@workspace/integrations-openai-ai-server";
import type { InterestSummary } from "@workspace/neurobrane";

/**
 * Meaning-based grouping of the companion's curiosities.
 *
 * Instead of a fixed keyword list on the client, the server asks the language
 * model to cluster the current interest topics by meaning ("astrophysics"
 * joins "space", typos and synonyms land where they belong). The result is a
 * map from normalized topic key → theme label; topics missing from the map
 * stand alone. Grouping is display-time only — it never changes how interests
 * are stored, weighted, or how the personality evolves.
 *
 * The map is cached in the companion_selves row keyed by a signature of the
 * topic set, so the model is only consulted when the set of interests
 * actually changes (affinity drift alone never triggers a recompute).
 */

/**
 * Stable signature of a topic set: sorted normalized keys, joined by newline
 * (topics are single-line; NUL would be rejected inside Postgres JSONB).
 */
export function themeSignature(topics: string[]): string {
  return [...topics].map((t) => t.trim().toLowerCase()).sort().join("\n");
}

/** In-flight recomputes per conversation, so concurrent reads share one call. */
const inFlight = new Map<number, Promise<Record<string, string> | null>>();

/**
 * Validate and normalise the model's raw grouping output. Keeps only labels
 * that are short non-empty strings for known topics, then drops any theme
 * that ends up with fewer than two members — a "group of one" is just the
 * topic itself and would render as a pointless cluster.
 */
export function sanitizeThemes(
  raw: unknown,
  topics: string[],
): Record<string, string> {
  const known = new Set(topics);
  const provisional: Record<string, string> = {};
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    for (const [topic, label] of Object.entries(raw as Record<string, unknown>)) {
      if (!known.has(topic)) continue;
      if (typeof label !== "string") continue;
      const clean = label.trim();
      if (clean.length === 0 || clean.length > 24) continue;
      provisional[topic] = clean;
    }
  }
  const counts: Record<string, number> = {};
  for (const label of Object.values(provisional)) {
    counts[label] = (counts[label] ?? 0) + 1;
  }
  const themes: Record<string, string> = {};
  for (const [topic, label] of Object.entries(provisional)) {
    if ((counts[label] ?? 0) >= 2) themes[topic] = label;
  }
  return themes;
}

/** Ask the model to cluster the topics by meaning. Throws on any failure. */
async function computeThemes(
  interests: InterestSummary[],
): Promise<Record<string, string>> {
  const topics = interests.map((it) => it.topic);
  const lines = interests.map((it) => `- ${it.topic}`).join("\n");

  const completion = await openai.chat.completions.create({
    model: "gpt-5-mini",
    max_completion_tokens: 4096,
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content:
          "You group a companion's curiosity topics by meaning. Given a list of topics, cluster the ones that genuinely belong together (synonyms, subfields, misspellings, singular/plural variants, closely related subjects). Reply with a JSON object mapping each grouped topic key to a short theme label (1–2 words, Title Case, e.g. \"Space\", \"Music\"). Rules: only include topics that share a theme with at least one other topic from the list — leave loners out entirely; use exactly the topic keys given (verbatim) as JSON keys; use the same label string for every member of a theme; never invent topics. If nothing groups, reply {}.",
      },
      { role: "user", content: `Topics:\n${lines}` },
    ],
  });

  const text = completion.choices[0]?.message?.content?.trim() ?? "";
  const parsed: unknown = JSON.parse(text);
  return sanitizeThemes(parsed, topics);
}

/**
 * Return the meaning-based theme map for a conversation's current interests,
 * consulting the cache first. Best-effort: returns null when the grouping is
 * unavailable (model error, cache row missing) so callers can degrade to
 * ungrouped display. Fewer than two interests can never group — short-circuit
 * without touching the model.
 */
export async function getInterestThemes(
  conversationId: number,
  interests: InterestSummary[],
): Promise<Record<string, string> | null> {
  if (interests.length < 2) return {};

  const signature = themeSignature(interests.map((it) => it.topic));

  const [row] = await db
    .select({ interestThemes: companionSelves.interestThemes })
    .from(companionSelves)
    .where(eq(companionSelves.conversationId, conversationId));
  const cached = row?.interestThemes;
  if (cached && cached.signature === signature) {
    return cached.themes;
  }

  const existing = inFlight.get(conversationId);
  if (existing) return existing;

  const task = (async () => {
    try {
      const themes = await computeThemes(interests);
      const cache: InterestThemeCache = { signature, themes };
      await db
        .update(companionSelves)
        .set({ interestThemes: cache })
        .where(eq(companionSelves.conversationId, conversationId));
      return themes;
    } catch {
      // Stale themes are better than none while the set is still recognisable;
      // otherwise signal "no grouping" so the client shows topics individually.
      return cached ? cached.themes : null;
    } finally {
      inFlight.delete(conversationId);
    }
  })();
  inFlight.set(conversationId, task);
  return task;
}

/**
 * Non-blocking variant of `getInterestThemes` for use in latency-sensitive
 * paths (e.g. the self endpoint that the mind-map reads on open).
 *
 * Returns whatever is in the DB cache right now — even if the topic set has
 * changed since the last compute — and fires a background recompute when the
 * signature is stale or absent. The caller never waits for the model; it just
 * gets the best available grouping immediately.
 *
 * Fewer than two interests can never form a theme; returns {} in that case.
 */
export async function getInterestThemesCached(
  conversationId: number,
  interests: InterestSummary[],
): Promise<Record<string, string> | null> {
  if (interests.length < 2) return {};

  const signature = themeSignature(interests.map((it) => it.topic));

  const [row] = await db
    .select({ interestThemes: companionSelves.interestThemes })
    .from(companionSelves)
    .where(eq(companionSelves.conversationId, conversationId));
  const cached = row?.interestThemes;

  if (cached && cached.signature === signature) {
    return cached.themes;
  }

  // Signature mismatch or no cache — kick off a background recompute so the
  // next fetch (or the client's background refresh) can pick up fresh themes.
  if (!inFlight.has(conversationId)) {
    const task = (async () => {
      try {
        const themes = await computeThemes(interests);
        const cache: InterestThemeCache = { signature, themes };
        await db
          .update(companionSelves)
          .set({ interestThemes: cache })
          .where(eq(companionSelves.conversationId, conversationId));
        return themes;
      } catch {
        return cached ? cached.themes : null;
      } finally {
        inFlight.delete(conversationId);
      }
    })();
    inFlight.set(conversationId, task);
  }

  // Return immediately — stale cache is better than nothing; null signals
  // "no grouping yet" so the client falls back to its heuristic grouping.
  return cached ? cached.themes : null;
}
