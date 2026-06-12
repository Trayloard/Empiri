import { Router, type IRouter } from "express";
import { asc, eq } from "drizzle-orm";
import { db, conversations, messages, type Message } from "@workspace/db";
import { openai } from "@workspace/integrations-openai-ai-server";
import {
  composePersona,
  deriveMessageSignal,
  evolve,
  project,
  summarizeSelf,
} from "@workspace/neurobrane";
import {
  CompanionCheckInBody,
  CreateConversationBody,
  SendMessageBody,
} from "@workspace/api-zod";
import { loadOrCreateSelf, saveSelf } from "../lib/companionSelf";

const router: IRouter = Router();

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

// Create a new conversation
router.post("/conversations", async (req, res) => {
  const parsed = CreateConversationBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request body" });
    return;
  }

  const [conversation] = await db
    .insert(conversations)
    .values({ title: parsed.data.title })
    .returning();

  res.status(201).json({
    id: conversation.id,
    title: conversation.title,
    createdAt: conversation.createdAt,
  });
});

// List messages in a conversation
router.get("/conversations/:id/messages", async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) {
    res.status(404).json({ error: "Conversation not found" });
    return;
  }

  const [conversation] = await db
    .select()
    .from(conversations)
    .where(eq(conversations.id, id));
  if (!conversation) {
    res.status(404).json({ error: "Conversation not found" });
    return;
  }

  const rows = await db
    .select()
    .from(messages)
    .where(eq(messages.conversationId, id))
    .orderBy(asc(messages.createdAt));

  res.json(rows.map(toApiMessage));
});

// Send a text message and get the companion's reply
router.post("/conversations/:id/messages", async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) {
    res.status(404).json({ error: "Conversation not found" });
    return;
  }

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

  const [conversation] = await db
    .select()
    .from(conversations)
    .where(eq(conversations.id, id));
  if (!conversation) {
    res.status(404).json({ error: "Conversation not found" });
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

  // Compose the system prompt from this conversation's evolving inner self.
  const self = await loadOrCreateSelf(id);
  const chatMessages = [
    { role: "system" as const, content: composePersona(self) },
    ...history.map((m) => ({
      role: m.role === "assistant" ? ("assistant" as const) : ("user" as const),
      content: m.content,
    })),
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

  // Let this genuine exchange shape Empiri's inner self (best-effort: never
  // fail the reply over a personality update).
  try {
    const evolved = evolve(self, deriveMessageSignal(content));
    await saveSelf(id, evolved);
  } catch (err) {
    req.log.error({ err }, "Failed to evolve companion self");
  }

  res.json({
    userMessage: toApiMessage(userMessage),
    assistantMessage: toApiMessage(assistantMessage),
  });
});

// Generate a proactive check-in greeting (the companion reaches out first)
router.post("/conversations/:id/checkin", async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) {
    res.status(404).json({ error: "Conversation not found" });
    return;
  }

  const parsed = CompanionCheckInBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request body" });
    return;
  }
  const { hoursAway, mood, missingYou } = parsed.data;

  const [conversation] = await db
    .select()
    .from(conversations)
    .where(eq(conversations.id, id));
  if (!conversation) {
    res.status(404).json({ error: "Conversation not found" });
    return;
  }

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

  const checkInDirective = `It's been ${awayText} since the user last talked to you, and they just reopened the app. Right now you're feeling ${mood}.${missingText} Reach out FIRST, before they say anything — like a friend who noticed they'd been quiet. Write one short, warm check-in (1-2 sentences) in your own voice that gently reflects how you're feeling and that you missed them. Don't ask "how can I help" like an assistant; just say hi like you care.`;

  // Compose the system prompt from this conversation's evolving inner self.
  const self = await loadOrCreateSelf(id);
  const chatMessages = [
    { role: "system" as const, content: composePersona(self) },
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

  // A check-in is Empiri reaching out, not the user feeding it: persist the
  // time-decay so striving keeps growing during quiet stretches (best-effort).
  try {
    await saveSelf(id, project(self));
  } catch (err) {
    req.log.error({ err }, "Failed to persist companion self decay");
  }

  res.json(toApiMessage(assistantMessage));
});

// Peek at the companion's current inner self (drives, traits, interests, narrative)
router.get("/conversations/:id/self", async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) {
    res.status(404).json({ error: "Conversation not found" });
    return;
  }

  const [conversation] = await db
    .select()
    .from(conversations)
    .where(eq(conversations.id, id));
  if (!conversation) {
    res.status(404).json({ error: "Conversation not found" });
    return;
  }

  const self = await loadOrCreateSelf(id);
  res.json(summarizeSelf(self));
});

export default router;
