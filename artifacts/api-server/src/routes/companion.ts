import { Router, type IRouter } from "express";
import { asc, eq } from "drizzle-orm";
import {
  db,
  conversations,
  messages,
  companionSettings,
  TONE_VALUES,
  type Message,
  type CompanionSettings,
  type Tone,
} from "@workspace/db";
import { openai } from "@workspace/integrations-openai-ai-server";
import {
  composePersona,
  perceive,
  project,
  summarizeSelf,
  MEMORY_BLOCK_ID,
  normalizeFactKey,
  type MemoryData,
} from "@workspace/neurobrane";
import {
  CompanionCheckInBody,
  CreateConversationBody,
  RenameConversationBody,
  SendMessageBody,
  UpdateCompanionMemoryBody,
} from "@workspace/api-zod";
import { loadOrCreateSelf, saveSelf } from "../lib/companionSelf";
import { getInterestThemesCached } from "../lib/interestThemes";
import {
  enqueueConversationTask,
  queueSelfEvolution,
  type SignalLogger,
} from "../lib/messageSignal";
import { maybeReflect, primeReflection, takeCachedReflection } from "../lib/reflection";
import { getSelfHistory, maybeSnapshotSelf } from "../lib/selfSnapshots";
import {
  buildContextMessages,
  getIncrementalMessagesForSummarisation,
  nextSummarizedCount,
  shouldRefreshSummary,
} from "../lib/contextWindow";
import { buildToneAddendum } from "../lib/companionPrompt";

const router: IRouter = Router();

/**
 * Strictly parse a conversation ID from a URL param. Accepts only a plain
 * positive base-10 integer string (e.g. "42") — no signs, whitespace,
 * decimals, exponents, hex, or trailing junk. Returns null for anything else.
 */
function parseConversationId(raw: unknown): number | null {
  if (typeof raw !== "string" || !/^\d+$/.test(raw)) return null;
  const id = Number.parseInt(raw, 10);
  if (!Number.isSafeInteger(id) || id <= 0) return null;
  return id;
}

/** Single not-found response so malformed, missing, and not-owned all look identical. */
function respondConversationNotFound(res: { status: (code: number) => { json: (body: unknown) => unknown } }): void {
  res.status(404).json({ error: "Conversation not found" });
}

// The companion's persona is no longer a fixed string: it is composed at
// request time from the conversation's evolving inner self (see
// @workspace/neurobrane and ../lib/companionSelf). The inner self still carries
// the same warm, TTS-safe identity and style scaffolding as before.

function toApiMessage(m: Message) {
  return {
    id: m.id,
    conversationId: m.conversationId,
    role: m.role,
    content: m.content,
    createdAt: m.createdAt,
  };
}

/**
 * Epoch ms of the newest message BEFORE the just-inserted one (excluded by
 * id, not position, so equal timestamps can't confuse the pick), or null for
 * a previously empty conversation. This is the "last contact" a reflection
 * measures the absence against.
 */
function lastContactBefore(history: Message[], excludeMessageId: number): number | null {
  let latest: number | null = null;
  for (const m of history) {
    if (m.id === excludeMessageId) continue;
    const at = new Date(m.createdAt).getTime();
    if (Number.isFinite(at) && (latest == null || at > latest)) latest = at;
  }
  return latest;
}

/** Default settings used when no row exists yet (avoids a write on every request). */
const DEFAULT_SETTINGS: Pick<CompanionSettings, "companionName" | "tone" | "personalityNote"> =
  { companionName: "Empiri", tone: "calm", personalityNote: "" };

/**
 * Loads companion settings for a user from the DB.
 * Returns in-memory defaults if no row exists yet (avoids a spurious write
 * on every message).  The PUT /companion-settings endpoint creates the row.
 */
async function loadSettings(
  userId: string,
): Promise<Pick<CompanionSettings, "companionName" | "tone" | "personalityNote">> {
  const [row] = await db
    .select()
    .from(companionSettings)
    .where(eq(companionSettings.userId, userId));
  return row ?? DEFAULT_SETTINGS;
}

/**
 * Fold opt-in device percepts (shake, charging, battery, daypart) into the
 * self for THIS reply. The fold is pure and instant (no model call), so it
 * runs in-memory right here — the returned self already carries the fresh
 * perception when the persona composes, letting "oh, we were just shaken"
 * land in the same reply. Persistence goes through the per-conversation task
 * queue (reload → perceive → save) so a stale projection can never overwrite
 * a concurrent evolution; sanitization inside `perceive` bounds everything
 * the client sent. With no percepts this is a no-op returning the input self.
 */
function feelPercepts(
  conversationId: number,
  self: Awaited<ReturnType<typeof loadOrCreateSelf>>,
  percepts: unknown,
  log?: SignalLogger,
): typeof self {
  if (!Array.isArray(percepts) || percepts.length === 0) return self;

  void enqueueConversationTask(conversationId, async () => {
    try {
      const latest = await loadOrCreateSelf(conversationId);
      await saveSelf(conversationId, perceive(latest, percepts));
    } catch (err) {
      log?.error({ err }, "Failed to persist device percepts");
    }
  });

  return perceive(self, percepts);
}

/**
 * Build the full system prompt for a conversation turn by combining the
 * evolving inner self with any user-chosen personalisation.
 */
async function buildSystemPrompt(
  userId: string,
  self: Awaited<ReturnType<typeof import("../lib/companionSelf").loadOrCreateSelf>>,
): Promise<string> {
  const settings = await loadSettings(userId);
  const base = composePersona(self);
  const addendum = buildToneAddendum(
    settings.companionName,
    settings.tone as Tone,
    settings.personalityNote ?? "",
  );
  return addendum ? `${base}\n\n${addendum}` : base;
}

// Create a new conversation — requires a signed-in user
router.post("/conversations", async (req, res) => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const parsed = CreateConversationBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request body" });
    return;
  }

  const [conversation] = await db
    .insert(conversations)
    .values({ title: parsed.data.title, ownerId: req.user.id })
    .returning();

  res.status(201).json({
    id: conversation.id,
    title: conversation.title,
    createdAt: conversation.createdAt,
  });
});

// List the signed-in user's conversations, oldest first. Lets a fresh
// install / second device resume the account's existing conversation instead
// of creating a new one.
router.get("/conversations", async (req, res) => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const rows = await db
    .select()
    .from(conversations)
    .where(eq(conversations.ownerId, req.user.id))
    .orderBy(asc(conversations.createdAt));

  res.json(
    rows.map((c) => ({
      id: c.id,
      title: c.title,
      createdAt: c.createdAt,
    })),
  );
});

/**
 * Shared ownership check: look up the conversation by id and verify it belongs
 * to the authenticated caller. Returns the conversation row on success, or
 * writes the appropriate error response and returns null.
 */
async function requireOwnedConversation(
  req: Parameters<Parameters<typeof router.get>[1]>[0],
  res: Parameters<Parameters<typeof router.get>[1]>[1],
): Promise<
  ((typeof conversations.$inferSelect) & { ownerId: string }) | null
> {
  const id = parseConversationId(req.params.id);
  if (id === null) {
    respondConversationNotFound(res);
    return null;
  }

  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Unauthorized" });
    return null;
  }

  const [conversation] = await db
    .select()
    .from(conversations)
    .where(eq(conversations.id, id));

  if (!conversation || conversation.ownerId !== req.user.id) {
    respondConversationNotFound(res);
    return null;
  }

  return { ...conversation, ownerId: req.user.id };
}

// Fetch a single conversation (id, title, createdAt) — owner only
router.get("/conversations/:id", async (req, res) => {
  const conversation = await requireOwnedConversation(req, res);
  if (!conversation) return;

  res.json({
    id: conversation.id,
    title: conversation.title,
    createdAt: conversation.createdAt,
  });
});

// Rename a conversation — owner only
router.patch("/conversations/:id", async (req, res) => {
  const conversation = await requireOwnedConversation(req, res);
  if (!conversation) return;

  const parsed = RenameConversationBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request body" });
    return;
  }
  const title = parsed.data.title.trim();
  if (!title) {
    res.status(400).json({ error: "Title is required" });
    return;
  }

  const [updated] = await db
    .update(conversations)
    .set({ title })
    .where(eq(conversations.id, conversation.id))
    .returning();

  res.json({
    id: updated.id,
    title: updated.title,
    createdAt: updated.createdAt,
  });
});

// List messages in a conversation
router.get("/conversations/:id/messages", async (req, res) => {
  const conversation = await requireOwnedConversation(req, res);
  if (!conversation) return;

  const rows = await db
    .select()
    .from(messages)
    .where(eq(messages.conversationId, conversation.id))
    .orderBy(asc(messages.createdAt));

  res.json(rows.map(toApiMessage));
});

// Send a text message and get the companion's reply
router.post("/conversations/:id/messages", async (req, res) => {
  const conversation = await requireOwnedConversation(req, res);
  if (!conversation) return;

  const id = conversation.id;

  const parsed = SendMessageBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Message content is required" });
    return;
  }
  const content = parsed.data.content.trim();
  if (!content) {
    res.status(400).json({ error: "Message content is required" });
    return;
  }

  // Persist the user's message first.
  const [userMessage] = await db
    .insert(messages)
    .values({ conversationId: id, role: "user", content })
    .returning();

  // Build the chat history for the model.
  const history = await db
    .select()
    .from(messages)
    .where(eq(messages.conversationId, id))
    .orderBy(asc(messages.createdAt));

  // Incrementally refresh the rolling context summary when new messages have
  // slid past the window boundary since the last watermark.  The summariser
  // only receives the bounded delta (not the full overflow) so cost stays
  // constant per refresh regardless of conversation length.  Best-effort: a
  // failed refresh never blocks the reply.
  let contextSummary = conversation.contextSummary ?? null;
  const lastSummarizedCount = conversation.contextSummaryMessageCount ?? null;
  if (shouldRefreshSummary(history.length, lastSummarizedCount)) {
    try {
      const delta = getIncrementalMessagesForSummarisation(history, lastSummarizedCount);
      const deltaText = delta
        .map((m) => `${m.role === "assistant" ? "Empiri" : "User"}: ${m.content}`)
        .join("\n");

      const systemInstruction = contextSummary
        ? `You are a memory assistant. Update the existing summary below by incorporating the new messages that follow. Keep the result to 100–150 words. Write in third person, e.g. "The user mentioned…".\n\nExisting summary:\n${contextSummary}`
        : `You are a memory assistant. Summarise the following conversation excerpt into a concise paragraph (100–150 words) covering the main topics discussed, any personal details the user shared, and the overall emotional tone. Write in third person, e.g. "The user mentioned…".`;

      const summaryCompletion = await openai.chat.completions.create({
        model: "gpt-5-mini",
        max_completion_tokens: 512,
        messages: [
          { role: "system", content: systemInstruction },
          { role: "user", content: deltaText },
        ],
      });
      const newSummary = summaryCompletion.choices[0]?.message?.content?.trim() ?? null;
      if (newSummary) {
        contextSummary = newSummary;
        // Advance the watermark only as far as we actually processed (delta.length),
        // not all the way to the window start.  If the gap was larger than one batch,
        // shouldRefreshSummary will still fire on the next turn and continue progress.
        const newWatermark = nextSummarizedCount(lastSummarizedCount, delta.length);
        await db
          .update(conversations)
          .set({ contextSummary: newSummary, contextSummaryMessageCount: newWatermark })
          .where(eq(conversations.id, id));
      }
    } catch (err) {
      req.log.error({ err }, "Failed to refresh context summary");
    }
  }

  // Compose the system prompt from this conversation's evolving inner self —
  // with any opt-in device percepts folded in first, so a fresh sensation can
  // colour this very reply — then layer the user's personalisation.
  const self = await loadOrCreateSelf(id);
  const felt = feelPercepts(id, self, parsed.data.percepts, req.log);
  const systemContent = await buildSystemPrompt(conversation.ownerId, felt);
  const windowedMessages = buildContextMessages(history, contextSummary);
  const chatMessages = [
    { role: "system" as const, content: systemContent },
    ...windowedMessages,
  ];

  let reply = "";
  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-5-mini",
      max_completion_tokens: 8192,
      messages: chatMessages,
    });
    reply = completion.choices[0]?.message?.content?.trim() ?? "";
  } catch (err) {
    req.log.error({ err }, "Companion reply generation failed");
    res.status(502).json({ error: "The companion couldn't reply right now." });
    return;
  }

  if (!reply) {
    res.status(502).json({ error: "The companion couldn't reply right now." });
    return;
  }

  const [assistantMessage] = await db
    .insert(messages)
    .values({ conversationId: id, role: "assistant", content: reply })
    .returning();

  res.json({
    userMessage: toApiMessage(userMessage),
    assistantMessage: toApiMessage(assistantMessage),
  });

  // Let this genuine exchange shape Empiri's inner self. The language-model
  // analysis (with heuristic fallback) runs AFTER the reply so it never adds
  // latency; failures are logged inside and never affect the response.
  void queueSelfEvolution(id, content, req.log);

  // Eigenleben: if this was the first message after a long absence, prime
  // Empiri's reflection so the thought is already resolved (or in flight)
  // if a check-in fires on the same process instance. The promise is cached
  // in reflection.ts; a concurrent check-in will consume it via
  // takeCachedReflection. Fire-and-forget — adds no latency here.
  primeReflection(id, {
    lastContactAt: lastContactBefore(history, userMessage.id),
    log: req.log,
  });
});

// Send a text message and stream the companion's reply as SSE.
// Each delta arrives as:  data: {"delta":"..."}\n\n
// On success the stream ends with: data: {"done":true,"userMessage":{...},"assistantMessage":{...}}\n\n
// On error the stream ends with:   data: {"error":"..."}\n\n
router.post("/conversations/:id/messages/stream", async (req, res) => {
  const conversation = await requireOwnedConversation(req, res);
  if (!conversation) return;

  const id = conversation.id;

  const parsed = SendMessageBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Message content is required" });
    return;
  }
  const content = parsed.data.content.trim();
  if (!content) {
    res.status(400).json({ error: "Message content is required" });
    return;
  }

  const [userMessage] = await db
    .insert(messages)
    .values({ conversationId: id, role: "user", content })
    .returning();

  const history = await db
    .select()
    .from(messages)
    .where(eq(messages.conversationId, id))
    .orderBy(asc(messages.createdAt));

  let contextSummary = conversation.contextSummary ?? null;
  const lastSummarizedCount = conversation.contextSummaryMessageCount ?? null;
  if (shouldRefreshSummary(history.length, lastSummarizedCount)) {
    try {
      const delta = getIncrementalMessagesForSummarisation(history, lastSummarizedCount);
      const deltaText = delta
        .map((m) => `${m.role === "assistant" ? "Empiri" : "User"}: ${m.content}`)
        .join("\n");
      const systemInstruction = contextSummary
        ? `You are a memory assistant. Update the existing summary below by incorporating the new messages that follow. Keep the result to 100–150 words. Write in third person, e.g. "The user mentioned…".\n\nExisting summary:\n${contextSummary}`
        : `You are a memory assistant. Summarise the following conversation excerpt into a concise paragraph (100–150 words) covering the main topics discussed, any personal details the user shared, and the overall emotional tone. Write in third person, e.g. "The user mentioned…".`;
      const summaryCompletion = await openai.chat.completions.create({
        model: "gpt-5-mini",
        max_completion_tokens: 512,
        messages: [
          { role: "system", content: systemInstruction },
          { role: "user", content: deltaText },
        ],
      });
      const newSummary = summaryCompletion.choices[0]?.message?.content?.trim() ?? null;
      if (newSummary) {
        contextSummary = newSummary;
        const newWatermark = nextSummarizedCount(lastSummarizedCount, delta.length);
        await db
          .update(conversations)
          .set({ contextSummary: newSummary, contextSummaryMessageCount: newWatermark })
          .where(eq(conversations.id, id));
      }
    } catch (err) {
      req.log.error({ err }, "Failed to refresh context summary (stream)");
    }
  }

  const self = await loadOrCreateSelf(id);
  const felt = feelPercepts(id, self, parsed.data.percepts, req.log);
  const systemContent = await buildSystemPrompt(conversation.ownerId, felt);
  const windowedMessages = buildContextMessages(history, contextSummary);
  const chatMessages = [
    { role: "system" as const, content: systemContent },
    ...windowedMessages,
  ];

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders();

  let reply = "";

  try {
    const stream = await openai.chat.completions.create({
      model: "gpt-5-mini",
      max_completion_tokens: 8192,
      messages: chatMessages,
      stream: true,
    });

    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta?.content ?? "";
      if (delta) {
        reply += delta;
        res.write(`data: ${JSON.stringify({ delta })}\n\n`);
      }
    }
  } catch (err) {
    req.log.error({ err }, "Companion streaming reply failed");
    res.write(`data: ${JSON.stringify({ error: "AI stream error" })}\n\n`);
    res.end();
    return;
  }

  if (!reply) {
    res.write(`data: ${JSON.stringify({ error: "AI stream did not complete" })}\n\n`);
    res.end();
    return;
  }

  const [assistantMessage] = await db
    .insert(messages)
    .values({ conversationId: id, role: "assistant", content: reply })
    .returning();

  res.write(
    `data: ${JSON.stringify({
      done: true,
      userMessage: toApiMessage(userMessage),
      assistantMessage: toApiMessage(assistantMessage),
    })}\n\n`,
  );
  res.end();

  // Fold the exchange into the inner self after the stream has closed — the
  // analysis (with heuristic fallback) never delays or breaks the reply.
  void queueSelfEvolution(id, content, req.log);

  // Eigenleben: prime the reflection so a concurrent check-in can consume
  // it instantly from the in-process cache. Fire-and-forget — no latency.
  primeReflection(id, {
    lastContactAt: lastContactBefore(history, userMessage.id),
    log: req.log,
  });
});

// Generate a proactive check-in greeting (the companion reaches out first)
router.post("/conversations/:id/checkin", async (req, res) => {
  const conversation = await requireOwnedConversation(req, res);
  if (!conversation) return;

  const id = conversation.id;

  const parsed = CompanionCheckInBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request body" });
    return;
  }
  const { hoursAway, mood, missingYou, percepts } = parsed.data;

  // Recent history for continuity, but the companion speaks first this time.
  const history = await db
    .select()
    .from(messages)
    .where(eq(messages.conversationId, id))
    .orderBy(asc(messages.createdAt));
  const recent = history.slice(-12);

  const awayText =
    hoursAway >= 24
      ? `about ${Math.round(hoursAway / 24)} day(s)`
      : `about ${Math.max(1, Math.round(hoursAway))} hour(s)`;
  const missingText =
    typeof missingYou === "number"
      ? ` Your "missing you" level is ${Math.round(missingYou)} out of 100.`
      : "";

  // Eigenleben: if the user was away long enough, compose Empiri's own
  // thought about the absence so the greeting opens with it instead of a
  // generic hello. Fail-soft by contract: any problem returns null and the
  // directive below stays byte-identical to the pre-reflection behaviour.
  const lastMessage = history[history.length - 1];
  const lastContactAt = lastMessage
    ? new Date(lastMessage.createdAt).getTime()
    : null;

  // Start reflection in parallel with self-loading and system-prompt
  // composition. If the message route already called primeReflection (user
  // sent a message and a check-in near-simultaneously), the cached promise
  // is in flight and may already be done — we consume it for free. If there
  // is no cached promise (pure check-in flow), we start a fresh generation.
  // Either way a 1.5 s timeout ensures the greeting is never held back by a
  // slow AI call; the promise keeps running and persists the moment regardless.
  const REFLECTION_TIMEOUT_MS = 1500;
  const reflectionPromise =
    takeCachedReflection(id) ?? maybeReflect(id, { lastContactAt, log: req.log });

  // Load self and compose system prompt while reflection is in flight.
  const self = await loadOrCreateSelf(id);
  const felt = feelPercepts(id, self, percepts, req.log);
  const systemContent = await buildSystemPrompt(conversation.ownerId, felt);

  // Collect the reflection: use it if it's already resolved, skip if not.
  const reflectionThought = await Promise.race([
    reflectionPromise,
    new Promise<null>((resolve) =>
      setTimeout(() => resolve(null), REFLECTION_TIMEOUT_MS),
    ),
  ]);

  const reflectionText = reflectionThought
    ? ` While they were away, one thought of your own kept returning to you — here it is: "${reflectionThought}". OPEN your check-in with this thought in your own words, like a friend saying "I've been thinking about…". Keep it natural and brief; the thought comes first, the hello can be implicit.`
    : "";

  // When this conversation has a stored memory summary, weave one light,
  // natural reference into the greeting so Empiri feels like it genuinely
  // remembers ("Last time you mentioned…"). No summary yet → plain greeting.
  // When a reflection is present it already carries the remembering, so the
  // memory weave stands down to keep the greeting short.
  const memorySummary = conversation.contextSummary?.trim() || null;
  const memoryText = memorySummary && !reflectionThought
    ? ` You also remember what you two have talked about before — here is your memory of it: "${memorySummary}". If it feels natural, gently weave ONE small detail from that memory into your greeting (like "last time you mentioned…"), showing you remember them. Pick something warm or personal, not a recap — never list things or summarise the whole memory back at them.`
    : "";

  const checkInDirective = `It's been ${awayText} since the user last talked to you, and they just reopened the app. Right now you're feeling ${mood}.${missingText} Reach out FIRST, before they say anything — like a friend who noticed they'd been quiet. Write one short, warm check-in (1-2 sentences) in your own voice that gently reflects how you're feeling and that you missed them. Don't ask "how can I help" like an assistant; just say hi like you care.${reflectionText}${memoryText}`;
  const chatMessages = [
    { role: "system" as const, content: systemContent },
    ...recent.map((m) => ({
      role: m.role === "assistant" ? ("assistant" as const) : ("user" as const),
      content: m.content,
    })),
    { role: "system" as const, content: checkInDirective },
  ];

  let reply = "";
  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-5-mini",
      max_completion_tokens: 8192,
      messages: chatMessages,
    });
    reply = completion.choices[0]?.message?.content?.trim() ?? "";
  } catch (err) {
    req.log.error({ err }, "Companion check-in generation failed");
    res.status(502).json({ error: "The companion couldn't reach out right now." });
    return;
  }

  if (!reply) {
    res.status(502).json({ error: "The companion couldn't reach out right now." });
    return;
  }

  const [assistantMessage] = await db
    .insert(messages)
    .values({ conversationId: id, role: "assistant", content: reply })
    .returning();

  res.json(toApiMessage(assistantMessage));

  // A check-in is Empiri reaching out, not the user feeding it: persist the
  // time-decay so striving keeps growing during quiet stretches (best-effort).
  // Queued through the same per-conversation chain as message folds — and
  // reloaded inside the queue — so a stale projection can never overwrite an
  // interaction that evolved the self while the check-in was generating.
  void enqueueConversationTask(id, async () => {
    try {
      const latest = await loadOrCreateSelf(id);
      const projected = project(latest);
      await saveSelf(id, projected);
      await maybeSnapshotSelf(id, projected);
    } catch (err) {
      req.log.error({ err }, "Failed to persist companion self decay");
    }
  });
});

// Peek at the companion's current inner self (drives, traits, interests, narrative).
// Also attaches the meaning-based grouping of curiosities (`themes`), computed
// server-side and cached per topic set — best-effort: null when unavailable,
// in which case the client shows curiosities individually.
router.get("/conversations/:id/self", async (req, res) => {
  const conversation = await requireOwnedConversation(req, res);
  if (!conversation) return;

  const self = await loadOrCreateSelf(conversation.id);
  const summary = summarizeSelf(self);

  let themes: Record<string, string> | null = null;
  try {
    themes = await getInterestThemesCached(conversation.id, summary.interests);
  } catch (err) {
    req.log.error({ err }, "Failed to group curiosities by meaning");
  }

  res.json({ ...summary, themes });
});

// See how the companion has grown: the timeline of inner-self snapshots
// (drives, traits, emerging curiosities) captured over the life of the chat.
router.get("/conversations/:id/self/history", async (req, res) => {
  const conversation = await requireOwnedConversation(req, res);
  if (!conversation) return;

  const snapshots = await getSelfHistory(conversation.id);
  res.json({ snapshots });
});

// What the companion remembers: the rolling context summary of earlier
// messages that have slid out of the live context window. Read-only.
router.get("/conversations/:id/memory", async (req, res) => {
  const conversation = await requireOwnedConversation(req, res);
  if (!conversation) return;

  res.json({ summary: conversation.contextSummary ?? null });
});

// Edit what the companion remembers: replace the rolling context summary with
// user-provided text. The summariser watermark is preserved so future
// refreshes fold new overflow into the corrected summary rather than
// re-summarising from scratch.
router.patch("/conversations/:id/memory", async (req, res) => {
  const conversation = await requireOwnedConversation(req, res);
  if (!conversation) return;

  const parsed = UpdateCompanionMemoryBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request body" });
    return;
  }
  const summary = parsed.data.summary.trim();
  if (!summary) {
    res.status(400).json({ error: "Summary is required" });
    return;
  }

  const [updated] = await db
    .update(conversations)
    .set({ contextSummary: summary })
    .where(eq(conversations.id, conversation.id))
    .returning();

  res.json({ summary: updated.contextSummary });
});

// Delete a single learned fact from the companion's long-term memory. The
// fact is identified by its normalised slot key. If the key is not found the
// response is still 200 — idempotent: the end-state (key absent) is the same.
router.delete("/conversations/:id/companion/facts/:key", async (req, res) => {
  const conversation = await requireOwnedConversation(req, res);
  if (!conversation) return;

  const rawKey = typeof req.params.key === "string" ? req.params.key : "";
  const key = normalizeFactKey(rawKey);
  if (!key) {
    res.status(400).json({ error: "Invalid fact key" });
    return;
  }

  const self = await loadOrCreateSelf(conversation.id);
  const memoryEnvelope = self.blocks[MEMORY_BLOCK_ID];
  if (memoryEnvelope) {
    const data = memoryEnvelope.data as MemoryData;
    const filtered = data.facts.filter((f) => f.key !== key);
    if (filtered.length !== data.facts.length) {
      await saveSelf(conversation.id, {
        ...self,
        blocks: {
          ...self.blocks,
          [MEMORY_BLOCK_ID]: {
            ...memoryEnvelope,
            data: { ...data, facts: filtered },
          },
        },
      });
    }
  }

  res.json({ ok: true });
});

// Clear what the companion remembers: remove the stored summary and reset the
// summariser watermark so the memory genuinely starts over (the next overflow
// past the context window builds a fresh summary from that point on).
router.delete("/conversations/:id/memory", async (req, res) => {
  const conversation = await requireOwnedConversation(req, res);
  if (!conversation) return;

  await db
    .update(conversations)
    .set({ contextSummary: null, contextSummaryMessageCount: null })
    .where(eq(conversations.id, conversation.id));

  res.json({ summary: null });
});

// DEV-ONLY: roll Empiri's inner self back a few steps without wiping it
// completely. Useful for testing the early-relationship UX without creating a
// fresh conversation. Only available when NODE_ENV !== "production".
//
// What "wind back" does:
//   - interactions halved (rounded down)
//   - every interest's affinity halved (interests that drop to 0 are removed)
//   - the two most-recent narrative lines removed
//   - each trait nudged 30 % of the way back toward its baseline
//   - drive levels nudged 30 % of the way back toward their baseline
//   - lastUpdatedAt reset to now so no extra time-decay fires on next load
router.post("/conversations/:id/dev/regress", async (req, res) => {
  if (process.env.NODE_ENV === "production") {
    res.status(404).json({ error: "Not found" });
    return;
  }

  const conversation = await requireOwnedConversation(req, res);
  if (!conversation) return;

  const self = await loadOrCreateSelf(conversation.id);
  const now = Date.now();

  const regressedBlocks: typeof self.blocks = {};

  for (const [blockId, envelope] of Object.entries(self.blocks)) {
    if (blockId === "core-self") {
      const data = envelope.data as {
        traits: Record<string, number>;
        interests: Array<{ topic: string; affinity: number; display?: string }>;
        narrative: string[];
      };

      const traitBaselines: Record<string, number> = {
        warmth: 70,
        playfulness: 60,
        curiosity: 55,
        openness: 55,
        calm: 50,
      };

      const traits: Record<string, number> = {};
      for (const [key, value] of Object.entries(data.traits)) {
        const baseline = traitBaselines[key] ?? 50;
        traits[key] = value + (baseline - value) * 0.3;
      }

      const interests = data.interests
        .map((i) => ({ ...i, affinity: i.affinity * 0.5 }))
        .filter((i) => i.affinity > 0.5);

      const narrative = data.narrative.slice(0, Math.max(0, data.narrative.length - 2));

      regressedBlocks[blockId] = {
        ...envelope,
        lastUpdatedAt: now,
        // Spread first so newer core-self fields (archive, chapters) survive.
        data: { ...data, traits, interests, narrative },
      };
    } else if (blockId === "drives") {
      const data = envelope.data as { levels: Record<string, number> };

      const driveBaselines: Record<string, number> = {
        connection: 55,
        curiosity: 50,
        novelty: 45,
        expression: 48,
      };

      const levels: Record<string, number> = {};
      for (const [key, value] of Object.entries(data.levels)) {
        const baseline = driveBaselines[key] ?? 50;
        levels[key] = value + (baseline - value) * 0.3;
      }

      regressedBlocks[blockId] = {
        ...envelope,
        lastUpdatedAt: now,
        data: { levels },
      };
    } else {
      regressedBlocks[blockId] = { ...envelope, lastUpdatedAt: now };
    }
  }

  const regressed = {
    ...self,
    interactions: Math.floor(self.interactions / 2),
    blocks: regressedBlocks,
  };

  await saveSelf(conversation.id, regressed);

  res.json({ ok: true, interactions: regressed.interactions });
});

// GET /companion-settings — returns the current user's personalisation settings.
// On first call the row is upserted with defaults so future PUTs can update it.
router.get("/companion-settings", async (req, res) => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const [existing] = await db
    .select()
    .from(companionSettings)
    .where(eq(companionSettings.userId, req.user.id));

  if (existing) {
    res.json({
      companionName: existing.companionName,
      tone: existing.tone,
      personalityNote: existing.personalityNote,
    });
    return;
  }

  // First access — create the row with defaults.
  const [created] = await db
    .insert(companionSettings)
    .values({ userId: req.user.id })
    .returning();

  res.json({
    companionName: created.companionName,
    tone: created.tone,
    personalityNote: created.personalityNote,
  });
});

// PUT /companion-settings — save (upsert) personalisation settings.
router.put("/companion-settings", async (req, res) => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const { companionName, tone, personalityNote } = req.body as {
    companionName?: unknown;
    tone?: unknown;
    personalityNote?: unknown;
  };

  // Validate each field if present.
  if (
    companionName !== undefined &&
    (typeof companionName !== "string" ||
      companionName.trim().length === 0 ||
      companionName.trim().length > 32)
  ) {
    res
      .status(400)
      .json({ error: "companionName must be 1–32 characters." });
    return;
  }

  if (tone !== undefined && !TONE_VALUES.includes(tone as Tone)) {
    res
      .status(400)
      .json({ error: `tone must be one of: ${TONE_VALUES.join(", ")}` });
    return;
  }

  if (
    personalityNote !== undefined &&
    (typeof personalityNote !== "string" || personalityNote.length > 500)
  ) {
    res
      .status(400)
      .json({ error: "personalityNote must be at most 500 characters." });
    return;
  }

  const patch: Partial<{
    companionName: string;
    tone: Tone;
    personalityNote: string;
  }> = {};
  if (companionName !== undefined) patch.companionName = (companionName as string).trim();
  if (tone !== undefined) patch.tone = tone as Tone;
  if (personalityNote !== undefined) patch.personalityNote = personalityNote as string;

  const [upserted] = await db
    .insert(companionSettings)
    .values({ userId: req.user.id, ...patch })
    .onConflictDoUpdate({
      target: companionSettings.userId,
      set: patch,
    })
    .returning();

  res.json({
    companionName: upserted.companionName,
    tone: upserted.tone,
    personalityNote: upserted.personalityNote,
  });
});

export default router;
