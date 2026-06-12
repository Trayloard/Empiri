import { index, integer, jsonb, pgTable, serial, timestamp } from "drizzle-orm/pg-core";
import type { DriveSummary, InterestSummary, TraitSummary } from "@workspace/neurobrane";

import { conversations } from "./conversations";

/**
 * A point-in-time summary of a conversation's inner self, used to show how
 * Empiri has grown over time. Unlike `companion_selves` (exactly one live row
 * per conversation), there are MANY snapshots per conversation — one captured
 * each time the self has meaningfully moved on (see the server's throttle).
 *
 * We store the friendly *summary* (drives/traits/interests), not the full
 * `InnerSelf` blob: the timeline only needs these values, the summary shape is
 * the same one the API already serves, and it stays decoupled from
 * neurobrane's internal per-block versioning. `interactions` is lifted into its
 * own column so the snapshot throttle can compare counts without parsing JSON.
 */
export interface SelfSnapshotSummary {
  drives: DriveSummary[];
  traits: TraitSummary[];
  interests: InterestSummary[];
}

export const companionSelfSnapshots = pgTable(
  "companion_self_snapshots",
  {
    id: serial("id").primaryKey(),
    conversationId: integer("conversation_id")
      .notNull()
      .references(() => conversations.id, { onDelete: "cascade" }),
    interactions: integer("interactions").notNull(),
    summary: jsonb("summary").$type<SelfSnapshotSummary>().notNull(),
    capturedAt: timestamp("captured_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("companion_self_snapshots_conversation_captured_idx").on(
      t.conversationId,
      t.capturedAt,
    ),
  ],
);

export type CompanionSelfSnapshot = typeof companionSelfSnapshots.$inferSelect;
export type InsertCompanionSelfSnapshot = typeof companionSelfSnapshots.$inferInsert;
