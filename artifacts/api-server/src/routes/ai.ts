import { openai } from "@workspace/integrations-openai-ai-server";
import { Router, type IRouter, type Request, type Response } from "express";
import { db, conversations, messages } from "@workspace/db";
import { asc, eq } from "drizzle-orm";

import { DEFAULT_TITLE, getOwnedConversation } from "./conversations";

const router: IRouter = Router();

const DEFAULT_SYSTEM_PROMPT =
  "You are Empiri, a playful and curious AI companion who lives inside a Dynamic Island on an iPhone. You respond concisely (2-4 sentences max) with warmth and a touch of whimsy. You never mention being an AI or language model.";

router.post("/ai/chat", async (req: Request, res: Response) => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }

  const { message, system, conversationId } = req.body as {
    message?: unknown;
    system?: unknown;
    conversationId?: unknown;
  };

  if (typeof message !== "string" || message.trim().length === 0) {
    res.status(400).json({ error: "message is required" });
    return;
  }

  if (typeof conversationId !== "number" || !Number.isInteger(conversationId)) {
    res.status(400).json({ error: "conversationId is required" });
    return;
  }

  // Ownership must be resolved with a plain JSON error BEFORE we switch the
  // response into the SSE stream — otherwise a 404 can't be expressed cleanly.
  const conversation = await getOwnedConversation(req.user.id, conversationId);
  if (!conversation) {
    res.status(404).json({ error: "Conversation not found" });
    return;
  }

  const systemPrompt =
    typeof system === "string" && system.trim().length > 0
      ? system
      : DEFAULT_SYSTEM_PROMPT;

  // Persist the incoming user message first so the AI context is sourced from
  // the same persisted history the user sees (and stays coherent across
  // reloads and devices).
  await db.insert(messages).values({
    conversationId: conversation.id,
    role: "user",
    content: message,
  });

  // Give brand-new conversations a meaningful label for the chat switcher,
  // derived from the first thing the user says.
  if (conversation.title === DEFAULT_TITLE) {
    await db
      .update(conversations)
      .set({ title: message.trim().slice(0, 40) })
      .where(eq(conversations.id, conversation.id));
  }

  const history = await db
    .select()
    .from(messages)
    .where(eq(messages.conversationId, conversation.id))
    .orderBy(asc(messages.createdAt), asc(messages.id));

  const chatMessages: Array<{
    role: "system" | "user" | "assistant";
    content: string;
  }> = [
    { role: "system", content: systemPrompt },
    ...history.map((m) => ({
      role: m.role as "user" | "assistant",
      content: m.content,
    })),
  ];

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("Access-Control-Allow-Origin", "*");

  try {
    const stream = await openai.chat.completions.create({
      model: "gpt-5.4",
      max_completion_tokens: 512,
      messages: chatMessages,
      stream: true,
    });

    let fullContent = "";

    for await (const chunk of stream) {
      const content = chunk.choices[0]?.delta?.content;
      if (content) {
        fullContent += content;
        res.write(`data: ${JSON.stringify({ content })}\n\n`);
      }
    }

    // Persist the assistant reply only on a clean completion so a partial /
    // failed stream never poisons future context.
    if (fullContent) {
      await db.insert(messages).values({
        conversationId: conversation.id,
        role: "assistant",
        content: fullContent,
      });
    }

    res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
    res.end();
  } catch (err) {
    req.log.error({ err }, "AI chat error");
    res.write(`data: ${JSON.stringify({ error: "AI unavailable" })}\n\n`);
    res.end();
  }
});

export default router;
