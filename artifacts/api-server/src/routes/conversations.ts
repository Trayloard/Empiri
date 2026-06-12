import { Router, type IRouter, type Request, type Response } from "express";
import {
  ListConversationsResponse,
  CreateConversationBody,
  CreateConversationResponse,
  GetConversationMessagesParams,
  GetConversationMessagesResponse,
  SaveConversationMessageParams,
  SaveConversationMessageBody,
  SaveConversationMessageResponse,
  DeleteConversationParams,
  DeleteConversationResponse,
} from "@workspace/api-zod";
import { db, conversations, messages } from "@workspace/db";
import { and, asc, desc, eq } from "drizzle-orm";

const router: IRouter = Router();

export const DEFAULT_TITLE = "New chat";

// Returns the conversation only if it exists AND belongs to the user.
// Returns null otherwise so callers can answer 404 uniformly (no existence leak).
export async function getOwnedConversation(userId: string, conversationId: number) {
  const [row] = await db
    .select()
    .from(conversations)
    .where(
      and(
        eq(conversations.id, conversationId),
        eq(conversations.userId, userId),
      ),
    )
    .limit(1);
  return row ?? null;
}

router.get("/conversations", async (req: Request, res: Response) => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }

  const rows = await db
    .select()
    .from(conversations)
    .where(eq(conversations.userId, req.user.id))
    .orderBy(desc(conversations.createdAt), desc(conversations.id));

  res.json(
    ListConversationsResponse.parse({
      conversations: rows.map((c) => ({
        id: c.id,
        title: c.title,
        createdAt: c.createdAt.getTime(),
      })),
    }),
  );
});

router.post("/conversations", async (req: Request, res: Response) => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }

  const parsed = CreateConversationBody.safeParse(req.body ?? {});
  if (!parsed.success) {
    res.status(400).json({ error: "Missing or invalid required parameters" });
    return;
  }

  const [created] = await db
    .insert(conversations)
    .values({ userId: req.user.id, title: parsed.data.title ?? DEFAULT_TITLE })
    .returning();

  res.json(
    CreateConversationResponse.parse({
      conversation: {
        id: created.id,
        title: created.title,
        createdAt: created.createdAt.getTime(),
      },
    }),
  );
});

router.get(
  "/conversations/:conversationId/messages",
  async (req: Request, res: Response) => {
    if (!req.isAuthenticated()) {
      res.status(401).json({ error: "Not authenticated" });
      return;
    }

    const params = GetConversationMessagesParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: "Missing or invalid required parameters" });
      return;
    }

    const conversation = await getOwnedConversation(
      req.user.id,
      params.data.conversationId,
    );
    if (!conversation) {
      res.status(404).json({ error: "Conversation not found" });
      return;
    }

    const rows = await db
      .select()
      .from(messages)
      .where(eq(messages.conversationId, conversation.id))
      .orderBy(asc(messages.createdAt), asc(messages.id));

    res.json(
      GetConversationMessagesResponse.parse({
        messages: rows.map((m) => ({
          id: String(m.id),
          role: m.role,
          content: m.content,
          timestamp: m.createdAt.getTime(),
        })),
      }),
    );
  },
);

router.post(
  "/conversations/:conversationId/messages",
  async (req: Request, res: Response) => {
    if (!req.isAuthenticated()) {
      res.status(401).json({ error: "Not authenticated" });
      return;
    }

    const params = SaveConversationMessageParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: "Missing or invalid required parameters" });
      return;
    }

    const body = SaveConversationMessageBody.safeParse(req.body);
    if (!body.success) {
      res.status(400).json({ error: "Missing or invalid required parameters" });
      return;
    }

    const conversation = await getOwnedConversation(
      req.user.id,
      params.data.conversationId,
    );
    if (!conversation) {
      res.status(404).json({ error: "Conversation not found" });
      return;
    }

    const [saved] = await db
      .insert(messages)
      .values({
        conversationId: conversation.id,
        role: body.data.role,
        content: body.data.content,
      })
      .returning();

    res.json(
      SaveConversationMessageResponse.parse({
        message: {
          id: String(saved.id),
          role: saved.role,
          content: saved.content,
          timestamp: saved.createdAt.getTime(),
        },
      }),
    );
  },
);

router.delete(
  "/conversations/:conversationId",
  async (req: Request, res: Response) => {
    if (!req.isAuthenticated()) {
      res.status(401).json({ error: "Not authenticated" });
      return;
    }

    const params = DeleteConversationParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: "Missing or invalid required parameters" });
      return;
    }

    const conversation = await getOwnedConversation(
      req.user.id,
      params.data.conversationId,
    );
    if (!conversation) {
      res.status(404).json({ error: "Conversation not found" });
      return;
    }

    // Messages are removed via the conversation FK's ON DELETE CASCADE.
    await db.delete(conversations).where(eq(conversations.id, conversation.id));

    res.json(DeleteConversationResponse.parse({ success: true }));
  },
);

export default router;
