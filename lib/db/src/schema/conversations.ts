import { integer, pgTable, serial, text, timestamp, varchar } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./auth";

export const conversations = pgTable("conversations", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  ownerId: varchar("owner_id").references(() => usersTable.id),
  /** Condensed summary of messages that have slid out of the context window. */
  contextSummary: text("context_summary"),
  /**
   * How many messages were in the history when contextSummary was last
   * generated.  Used as a watermark so each summary refresh only processes
   * the incremental delta, not the full overflow.
   */
  contextSummaryMessageCount: integer("context_summary_message_count"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const insertConversationSchema = createInsertSchema(conversations).omit({
  id: true,
  createdAt: true,
});

export type Conversation = typeof conversations.$inferSelect;
export type InsertConversation = z.infer<typeof insertConversationSchema>;
