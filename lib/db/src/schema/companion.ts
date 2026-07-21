import { pgTable, text, timestamp, varchar } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

import { usersTable } from "./auth";

export const companionSettings = pgTable("companion_settings", {
  userId: varchar("user_id")
    .primaryKey()
    .references(() => usersTable.id, { onDelete: "cascade" }),
  name: text("name").notNull().default("Empiri"),
  tone: text("tone").notNull().default("playful"),
  personalityNote: text("personality_note"),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .notNull()
    .$onUpdate(() => new Date()),
});

export const insertCompanionSettingsSchema = createInsertSchema(
  companionSettings,
).omit({ updatedAt: true });

export type CompanionSettings = typeof companionSettings.$inferSelect;
export type InsertCompanionSettings = z.infer<
  typeof insertCompanionSettingsSchema
>;
