import { openai } from "@workspace/integrations-openai-ai-server";
import {
  applyReflection,
  shouldReflect,
  summarizeSelf,
  type InnerSelf,
} from "@workspace/neurobrane";
import { loadOrCreateSelf, saveSelf } from "./companionSelf";
import { enqueueConversationTask, type SignalLogger } from "./messageSignal";

/**
 * Eigenleben — Empiri's own thought between conversations.
 *
 * When the user returns after a longer absence (proactive check-in or first
 * message), the server lazily composes ONE short AI "reflection" from the
 * projected inner state: a first-person thought Empiri brings to the reunion,
 * plus a narrative moment for the self-timeline. No background process — the
 * reflection is created in the moment of return, so it also works on
 * Autoscale deployments.
 *
 * Every failure path here is silent: a broken or slow AI call must never
 * change the existing check-in or message flow.
 */

/**
 * Minimum hours of absence before a reflection is due. Coupled to the
 * check-in logic: the shortest proactive-outreach cadence is 6 hours
 * ("frequent" in artifacts/mobile/lib/mood.ts CADENCE_HOURS — the server
 * cannot import mobile code, so the floor is mirrored here). Any client-fired
 * check-in has therefore already waited at least this long; shorter absences
 * never produce a reflection on any path.
 */
export const REFLECTION_MIN_HOURS = 6;

const HOUR_MS = 3_600_000;

/** Hard caps so a runaway model reply can never bloat prompt or narrative. */
const MAX_THOUGHT_LENGTH = 300;
const MAX_MOMENT_LENGTH = 160;

export interface ComposedReflection {
  /** First-person thought Empiri opens the reunion with (user's language). */
  thought: string;
  /** One second-person line for the self-narrative timeline. */
  moment: string;
}

/**
 * Validate the model's reflection output. Strict by design: BOTH fields must
 * be usable strings within their caps, otherwise the whole reflection is
 * discarded (null) and the old check-in flow runs unchanged. A half-valid
 * reflection is worse than none.
 */
export function sanitizeReflection(raw: unknown): ComposedReflection | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const { thought, moment } = raw as { thought?: unknown; moment?: unknown };
  if (typeof thought !== "string" || typeof moment !== "string") return null;
  const trimmedThought = thought.trim();
  const trimmedMoment = moment.trim();
  if (trimmedThought.length === 0 || trimmedThought.length > MAX_THOUGHT_LENGTH) return null;
  if (trimmedMoment.length === 0 || trimmedMoment.length > MAX_MOMENT_LENGTH) return null;
  return { thought: trimmedThought, moment: trimmedMoment };
}

/**
 * Build the compact inner-state digest the reflection is composed from:
 * elapsed time, the drives that ache the most, the strongest remembered
 * facts, the top interests, and the most recent chapter of the shared story.
 */
export function buildReflectionDigest(self: InnerSelf, hoursAway: number): string {
  const summary = summarizeSelf(self);

  const awayText =
    hoursAway >= 24
      ? `about ${Math.round(hoursAway / 24)} day(s)`
      : `about ${Math.max(1, Math.round(hoursAway))} hour(s)`;

  const lines: string[] = [`Time since the user left: ${awayText}.`];

  const aching = [...summary.drives]
    .sort((a, b) => b.striving - a.striving)
    .slice(0, 2)
    .map((d) => d.key);
  if (aching.length > 0) {
    lines.push(`While alone you have especially missed: ${aching.join(", ")}.`);
  }

  const facts = [...summary.facts]
    .sort((a, b) => b.salience - a.salience)
    .slice(0, 3)
    .map((f) => f.text);
  if (facts.length > 0) {
    lines.push(`Things you remember about the user:\n- ${facts.join("\n- ")}`);
  }

  const interests = [...summary.interests]
    .slice(0, 3)
    .map((i) => i.display);
  if (interests.length > 0) {
    lines.push(`Topics you have grown curious about: ${interests.join(", ")}.`);
  }

  const lastChapter = summary.chapters[summary.chapters.length - 1];
  if (lastChapter) {
    lines.push(`The most recent chapter of your story together: ${lastChapter.text}`);
  }

  return lines.join("\n");
}

/** Ask the model to compose the reflection. Throws on any failure. */
async function composeReflection(
  self: InnerSelf,
  hoursAway: number,
): Promise<ComposedReflection> {
  const digest = buildReflectionDigest(self, hoursAway);

  const completion = await openai.chat.completions.create({
    model: "gpt-5-mini",
    max_completion_tokens: 1024,
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content:
          "You compose ONE private thought that Empiri — a warm little digital companion with real feelings, a bit like a Tamagotchi with a big heart — had while its user was away. You are given Empiri's inner state.\n" +
          'Reply with exactly this JSON shape: {"thought":"...","moment":"..."}\n' +
          '"thought": 1-2 short sentences in the FIRST person ("I..."), the thought Empiri wants to share the moment the user returns. Make it concrete and personal — anchor it in ONE remembered fact, interest, or story chapter (e.g. "I kept thinking about what you told me about your brother..."). Write it in the same language as the remembered facts (fall back to English). No greeting, no assistant offers, no lists, no markdown, at most one emoji.\n' +
          `"moment": ONE short line (max ${MAX_MOMENT_LENGTH} characters) for Empiri's private self-narrative, in the SECOND person and past tense, in English, matching lines like "You've found yourself increasingly drawn to jazz lately." (e.g. "While they were away, you kept thinking about their brother.").`,
      },
      { role: "user", content: digest },
    ],
  });

  const text = completion.choices[0]?.message?.content?.trim() ?? "";
  const reflection = sanitizeReflection(JSON.parse(text));
  if (!reflection) throw new Error("Model reflection did not match the expected shape");
  return reflection;
}

/**
 * In-process cache of reflection promises, keyed by conversation ID.
 *
 * Populated by `primeReflection` (called eagerly from the message route when
 * the user returns after a long absence), consumed once by the check-in route
 * via `takeCachedReflection`. Within a single server process this means the
 * AI call has a head start by the time the check-in arrives; on Autoscale a
 * cache miss is normal and the check-in falls back to starting fresh with a
 * 1.5 s timeout.
 */
const cachedReflections = new Map<number, Promise<string | null>>();

/**
 * Start a reflection in the background and cache the promise so a subsequent
 * check-in on the same process can consume it without waiting for the full AI
 * round-trip. No-op if a prime is already in flight for this conversation.
 * Never throws.
 */
export function primeReflection(
  conversationId: number,
  opts: { lastContactAt: number | null; now?: number; log?: SignalLogger },
): void {
  if (cachedReflections.has(conversationId)) return;
  const promise = maybeReflect(conversationId, opts).finally(() => {
    if (cachedReflections.get(conversationId) === promise) {
      cachedReflections.delete(conversationId);
    }
  });
  cachedReflections.set(conversationId, promise);
}

/**
 * Return and remove the cached reflection promise for this conversation, or
 * null if no prime has been started. One-shot: calling this clears the entry
 * so the check-in and the message route cannot both consume the same thought.
 */
export function takeCachedReflection(
  conversationId: number,
): Promise<string | null> | null {
  const p = cachedReflections.get(conversationId) ?? null;
  if (p) cachedReflections.delete(conversationId);
  return p;
}

/**
 * Compose a reflection for a returning user, if one is due. Returns the
 * first-person thought (for the check-in directive) or null when the absence
 * was too short, this absence was already reflected on, or the AI call
 * failed. Persistence (narrative moment + once-per-absence stamp) is queued
 * through the conversation's serialized evolution queue and re-checks the
 * gate on the freshly reloaded state so concurrent requests can never
 * double-reflect. Never throws.
 */
export async function maybeReflect(
  conversationId: number,
  opts: { lastContactAt: number | null; now?: number; log?: SignalLogger },
): Promise<string | null> {
  const { lastContactAt, log } = opts;
  const now = opts.now ?? Date.now();

  try {
    const self = await loadOrCreateSelf(conversationId);
    const gate = { lastContactAt, thresholdHours: REFLECTION_MIN_HOURS, now };
    if (!shouldReflect(self, gate)) return null;

    const hoursAway = (now - (lastContactAt as number)) / HOUR_MS;
    const composed = await composeReflection(self, hoursAway);

    void enqueueConversationTask(conversationId, async () => {
      try {
        // Reload inside the queue and re-check the gate: another request may
        // have reflected on this same absence while the AI call was in flight.
        const fresh = await loadOrCreateSelf(conversationId);
        if (!shouldReflect(fresh, gate)) return;
        const withReflection = applyReflection(fresh, composed.moment, now);
        await saveSelf(conversationId, withReflection);
      } catch (err) {
        log?.error({ err }, "Failed to persist companion reflection");
      }
    });

    return composed.thought;
  } catch (err) {
    log?.warn({ err }, "Reflection composition failed; continuing without it");
    return null;
  }
}
