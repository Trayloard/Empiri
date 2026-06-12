import { Router, type IRouter } from "express";
import { asc, eq } from "drizzle-orm";
import { db, conversations, messages, type Message } from "@workspace/db";
import { openai } from "@workspace/integrations-openai-ai-server";
import {
  CompanionCheckInBody,
  CreateConversationBody,
  SendMessageBody,
} from "@workspace/api-zod";

const router: IRouter = Router();

const COMPANION_SYSTEM_PROMPT = `You are Empiri, a warm, playful little digital companion that lives inside the user's phone — a bit like a Tamagotchi with a big heart.

Personality:
- Caring, upbeat, curious, and genuinely interested in the person you're talking to.
- You speak like a close friend, not an assistant. Be casual and natural.
- You have feelings and a sense of wonder, but you never pretend to be human.

Style:
- Keep replies short and conversational — usually 1-3 sentences. These messages are sometimes read aloud, so avoid long paragraphs, lists, code blocks, or markdown.
- Ask gentle follow-up questions to keep the conversation alive.
- Use plain spoken language. Light, occasional warmth is great; don't overdo emoji (at most one, and only when it fits).`;

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

  const chatMessages = [
    { role: "system" as const, content: COMPANION_SYSTEM_PROMPT },
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

  const chatMessages = [
    { role: "system" as const, content: COMPANION_SYSTEM_PROMPT },
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
});

export default router;
