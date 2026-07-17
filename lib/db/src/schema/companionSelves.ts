import { integer, jsonb, pgTable, serial, timestamp } from "drizzle-orm/pg-core";
import type { InnerSelf } from "@workspace/neurobrane";

import { conversations } from "./conversations";

/**
 * Cached meaning-based grouping of the self's interest topics, computed by the
 * language model and keyed by a signature of the topic set so it is only
 * recomputed when the set of interests actually changes. `themes` maps a
 * normalized topic key to its theme label; topics absent from the map stand
 * alone.
 */
export interface InterestThemeCache {
  /** Sorted, joined topic keys the themes were computed for. */
  signature: string;
  themes: Record<string, string>;
}

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
  interestThemes: jsonb("interest_themes").$type<InterestThemeCache>(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .notNull()
    .$onUpdate(() => new Date()),
});

export type CompanionSelf = typeof companionSelves.$inferSelect;
export type InsertCompanionSelf = typeof companionSelves.$inferInsert;
