import { eq } from "drizzle-orm";
import { companionSelves, db } from "@workspace/db";
import { createSelf, hydrate, type InnerSelf } from "@workspace/neurobrane";

/**
 * Load a conversation's inner self, creating it on first contact. There is one
 * self per conversation (no user accounts exist). Race-safe: a concurrent
 * insert is swallowed by `onConflictDoNothing`, after which we re-read the
 * winning row so both callers converge on the same persisted self.
 */
export async function loadOrCreateSelf(conversationId: number): Promise<InnerSelf> {
  const existing = await db
    .select()
    .from(companionSelves)
    .where(eq(companionSelves.conversationId, conversationId));
  if (existing[0]) {
    return hydrate(existing[0].state);
  }

  const fresh = createSelf();
  await db
    .insert(companionSelves)
    .values({ conversationId, state: fresh })
    .onConflictDoNothing();

  const [row] = await db
    .select()
    .from(companionSelves)
    .where(eq(companionSelves.conversationId, conversationId));
  return row ? hydrate(row.state) : fresh;
}

/** Persist an updated inner self for a conversation. */
export async function saveSelf(conversationId: number, state: InnerSelf): Promise<void> {
  await db
    .update(companionSelves)
    .set({ state })
    .where(eq(companionSelves.conversationId, conversationId));
}
