import { integer, jsonb, pgTable, serial, timestamp } from "drizzle-orm/pg-core";
import type { InnerSelf } from "@workspace/neurobrane";

import { conversations } from "./conversations";

/**
 * Empiri's evolving inner self, persisted per conversation. There is exactly
 * one self per conversation (no user accounts exist), enforced by the unique
 * conversationId. The whole self is stored as a single JSONB blob typed as
 * `InnerSelf`; its shape is owned and versioned by @workspace/neurobrane.
 */
export const companionSelves = pgTable("companion_selves", {
  id: serial("id").primaryKey(),
  conversationId: integer("conversation_id")
    .notNull()
    .unique()
    .references(() => conversations.id, { onDelete: "cascade" }),
  state: jsonb("state").$type<InnerSelf>().notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .notNull()
    .$onUpdate(() => new Date()),
});

export type CompanionSelf = typeof companionSelves.$inferSelect;
export type InsertCompanionSelf = typeof companionSelves.$inferInsert;
