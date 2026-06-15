import { pgTable, text, timestamp, varchar } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

import { usersTable } from "./auth";

export const TONE_VALUES = ["playful", "calm", "witty", "wise", "cheerful"] as const;
export type Tone = (typeof TONE_VALUES)[number];

export const companionSettings = pgTable("companion_settings", {
  userId: varchar("user_id")
    .primaryKey()
    .references(() => usersTable.id, { onDelete: "cascade" }),
  companionName: text("companion_name").notNull().default("Empiri"),
  tone: text("tone").$type<Tone>().notNull().default("calm"),
  personalityNote: text("personality_note").notNull().default(""),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .notNull()
    .$onUpdate(() => new Date()),
});

export const insertCompanionSettingsSchema = createInsertSchema(
  companionSettings,
).omit({ updatedAt: true });

export const updateCompanionSettingsSchema = insertCompanionSettingsSchema
  .partial()
  .omit({ userId: true });

export type CompanionSettings = typeof companionSettings.$inferSelect;
export type InsertCompanionSettings = z.infer<typeof insertCompanionSettingsSchema>;
