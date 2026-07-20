import { openai } from "@workspace/integrations-openai-ai-server";
import {
  deriveMessageSignal,
  evolve,
  normalizeFactKey,
  normalizeTopic,
  type FactCandidate,
  type InteractionSignal,
} from "@workspace/neurobrane";
import { loadOrCreateSelf, saveSelf } from "./companionSelf";
import { maybeSnapshotSelf } from "./selfSnapshots";

/**
 * Language-model message analysis for the evolving inner self.
 *
 * Instead of the regex/keyword heuristic deciding which topics and signal
 * strengths a user turn carries, the model extracts them: genuine subjects
 * (with the user's casing and a per-topic weight) plus the four emotional
 * signal strengths the drive/trait loop feeds on. The analysis runs AFTER the
 * reply has been sent — it never adds latency to the conversation — and any
 * failure falls back to the deterministic heuristic, so evolution never stops.
 */

/** Maximum number of topics folded from one message. */
const MAX_TOPICS = 3;

/** Maximum number of durable facts folded from one message. */
const MAX_FACTS = 3;

/**
 * Any genuine exchange feeds the need for connection at least a little (the
 * heuristic always used 1). A floor keeps the connection drive from starving
 * when the model scores a neutral message near zero.
 */
const CONNECTION_FLOOR = 0.4;

/** Shape the model is asked to produce (validated defensively below). */
interface RawAnalysis {
  topics?: unknown;
  facts?: unknown;
  connection?: unknown;
  curiosity?: unknown;
  novelty?: unknown;
  expression?: unknown;
}

function asUnitNumber(value: unknown): number | null {
  if (typeof value !== "number" || Number.isNaN(value)) return null;
  return Math.max(0, Math.min(1, value));
}

/**
 * Validate and normalise the model's raw analysis into an InteractionSignal.
 * Strict by design: if any of the four signal strengths is missing or
 * malformed, returns null so the caller falls back to the heuristic wholesale
 * (a half-trusted analysis is worse than a predictable fallback). Topics are
 * optional — an empty list is a legitimate result for filler messages, and is
 * exactly the noise-reduction the heuristic cannot deliver. Facts are equally
 * optional and validated leniently PER ENTRY: one malformed fact is skipped
 * without discarding the analysis (facts are an enrichment, not a core signal).
 */
export function sanitizeAnalyzedSignal(raw: unknown): InteractionSignal | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const candidate = raw as RawAnalysis;

  const connection = asUnitNumber(candidate.connection);
  const curiosity = asUnitNumber(candidate.curiosity);
  const novelty = asUnitNumber(candidate.novelty);
  const expression = asUnitNumber(candidate.expression);
  if (connection === null || curiosity === null || novelty === null || expression === null) {
    return null;
  }

  const topics: string[] = [];
  const topicDisplays: Record<string, string> = {};
  const topicWeights: Record<string, number> = {};
  if (Array.isArray(candidate.topics)) {
    for (const entry of candidate.topics) {
      if (topics.length >= MAX_TOPICS) break;
      if (!entry || typeof entry !== "object") continue;
      const { topic, weight } = entry as { topic?: unknown; weight?: unknown };
      if (typeof topic !== "string") continue;
      const display = topic.trim();
      // Guard against runaway phrases masquerading as topics.
      if (display.length === 0 || display.length > 40) continue;
      const key = normalizeTopic(display);
      if (key.length < 2) continue;
      const w = asUnitNumber(weight);
      if (w === null || w <= 0) continue;
      if (topics.includes(key)) {
        // Duplicate keys (e.g. "Jazz" and "jazz") keep the stronger weight.
        topicWeights[key] = Math.max(topicWeights[key] ?? 0, w);
        continue;
      }
      topics.push(key);
      topicDisplays[key] = display;
      topicWeights[key] = w;
    }
  }

  const facts: FactCandidate[] = [];
  if (Array.isArray(candidate.facts)) {
    const seenKeys = new Set<string>();
    for (const entry of candidate.facts) {
      if (facts.length >= MAX_FACTS) break;
      if (!entry || typeof entry !== "object") continue;
      const { key, text, confidence } = entry as {
        key?: unknown;
        text?: unknown;
        confidence?: unknown;
      };
      if (typeof key !== "string" || typeof text !== "string") continue;
      const normalizedKey = normalizeFactKey(key);
      if (normalizedKey.length < 2) continue;
      const trimmedText = text.trim();
      // Guard against empty statements and runaway paragraphs.
      if (trimmedText.length === 0 || trimmedText.length > 200) continue;
      const c = asUnitNumber(confidence);
      if (c === null || c <= 0) continue;
      if (seenKeys.has(normalizedKey)) continue;
      seenKeys.add(normalizedKey);
      facts.push({ key: normalizedKey, text: trimmedText, confidence: c });
    }
  }

  return {
    kind: "message",
    connection: Math.max(CONNECTION_FLOOR, connection),
    curiosity,
    novelty,
    expression,
    topics,
    topicDisplays,
    topicWeights,
    moodFactor: 1,
    ...(facts.length > 0 ? { facts } : {}),
  };
}

/** Ask the model to analyze one user message. Throws on any failure. */
async function analyzeMessage(content: string): Promise<InteractionSignal> {
  const completion = await openai.chat.completions.create({
    model: "gpt-5-mini",
    max_completion_tokens: 2048,
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content:
          'You analyze ONE user message sent to a warm AI companion. Extract:\n' +
          '1. "topics": up to 3 genuine subjects the user is engaging with — hobbies, fields, places, people, activities, concrete things (keep the user\'s language and best casing, e.g. "Astrophysik", "Paris"). NEVER include filler words, greetings, emotions, or generic verbs. Each topic gets a "weight" 0-1 for how central it is to the message. Use [] when the message carries no real subject.\n' +
          '2. "facts": up to 3 durable personal facts the user STATED about their own life — names, relationships, pets, job, home, health, upcoming events. Each fact has: "key", a stable snake_case slot identifier so a later update lands in the same slot (e.g. "dog_name", "job", "exam_date", "partner_name", "home_city"); "text", one short third-person statement in the user\'s language (e.g. "Their dog is called Milo"); "confidence" 0-1 for how clearly it was stated. Only real, durable facts — NEVER moods, opinions, or one-off plans for today. Use [] when the message states none.\n' +
          '3. Four signal strengths, each 0-1:\n' +
          '   "connection": how much genuine personal engagement the message shows,\n' +
          '   "curiosity": how much asking, wondering, or wanting to learn,\n' +
          '   "novelty": how new/varied the subject matter feels,\n' +
          '   "expression": how heartfelt, open, or expressive the sharing is.\n' +
          'Reply with exactly this JSON shape:\n' +
          '{"topics":[{"topic":"Astrophysik","weight":0.9}],"facts":[{"key":"dog_name","text":"Their dog is called Milo","confidence":0.9}],"connection":0.8,"curiosity":0.5,"novelty":0.6,"expression":0.4}',
      },
      { role: "user", content },
    ],
  });

  const text = completion.choices[0]?.message?.content?.trim() ?? "";
  const signal = sanitizeAnalyzedSignal(JSON.parse(text));
  if (!signal) throw new Error("Model analysis did not match the expected shape");
  return signal;
}

/** Minimal logger contract (pino request logger satisfies it). */
export interface SignalLogger {
  warn: (obj: unknown, msg?: string) => void;
  error: (obj: unknown, msg?: string) => void;
}

/**
 * Resolve the interaction signal for a user message: model analysis first,
 * deterministic heuristic as the fallback. Never throws.
 */
export async function resolveMessageSignal(
  content: string,
  log?: SignalLogger,
): Promise<InteractionSignal> {
  try {
    return await analyzeMessage(content);
  } catch (err) {
    log?.warn({ err }, "Message analysis failed; falling back to heuristic signal");
    return deriveMessageSignal(content);
  }
}

/** Per-conversation tail of the evolution queue (serializes folds). */
const evolutionQueues = new Map<number, Promise<void>>();

/**
 * Chain a task onto a conversation's queue so folds for the same conversation
 * never interleave (two quick messages each load-evolve-save; running them
 * concurrently would drop one interaction via last-write-wins).
 */
export function enqueueConversationTask(
  conversationId: number,
  task: () => Promise<void>,
): Promise<void> {
  const tail = evolutionQueues.get(conversationId) ?? Promise.resolve();
  const next = tail.then(task).catch(() => {
    // Errors are handled (logged) inside the task; keep the chain alive.
  });
  evolutionQueues.set(conversationId, next);
  void next.finally(() => {
    if (evolutionQueues.get(conversationId) === next) {
      evolutionQueues.delete(conversationId);
    }
  });
  return next;
}

/**
 * Fold one user message into the conversation's inner self, asynchronously:
 * analyze (or fall back), reload the freshest persisted self, evolve, save,
 * snapshot. Fire-and-forget from the routes — a failure is logged and the
 * reply is never affected.
 */
export function queueSelfEvolution(
  conversationId: number,
  content: string,
  log?: SignalLogger,
): Promise<void> {
  return enqueueConversationTask(conversationId, async () => {
    try {
      const signal = await resolveMessageSignal(content, log);
      // Reload inside the queue so we always fold into the latest state, not
      // the copy the route loaded before replying.
      const self = await loadOrCreateSelf(conversationId);
      const evolved = evolve(self, signal);
      await saveSelf(conversationId, evolved);
      await maybeSnapshotSelf(conversationId, evolved);
    } catch (err) {
      log?.error({ err }, "Failed to evolve companion self");
    }
  });
}
