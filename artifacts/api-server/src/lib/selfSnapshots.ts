import { asc, desc, eq } from "drizzle-orm";
import { companionSelfSnapshots, db } from "@workspace/db";
import { summarizeSelf, type InnerSelf } from "@workspace/neurobrane";

/**
 * Periodic history of the companion's inner self. There is no background
 * scheduler in this app, so "periodic" means: capture a fresh snapshot the
 * first time we ever see a conversation, and thereafter only once the self has
 * meaningfully moved on — either enough new interactions have happened, or
 * enough wall-clock time has passed (which matters for quiet stretches where
 * striving keeps growing). Both thresholds are env-overridable so a developer
 * can lower them to watch a timeline form without waiting hours.
 */
const DEFAULT_MIN_INTERVAL_MS = 6 * 60 * 60 * 1000; // 6 hours
const DEFAULT_INTERACTION_DELTA = 8;

function minIntervalMs(): number {
  const raw = Number(process.env.SELF_SNAPSHOT_MIN_INTERVAL_MS);
  return Number.isFinite(raw) && raw >= 0 ? raw : DEFAULT_MIN_INTERVAL_MS;
}

function interactionDelta(): number {
  const raw = Number(process.env.SELF_SNAPSHOT_INTERACTION_DELTA);
  return Number.isFinite(raw) && raw >= 1 ? raw : DEFAULT_INTERACTION_DELTA;
}

/**
 * Capture a snapshot for this conversation if it's due. Best-effort: callers
 * wrap this so a history hiccup never fails the user-facing request.
 */
export async function maybeSnapshotSelf(
  conversationId: number,
  self: InnerSelf,
): Promise<void> {
  const summary = summarizeSelf(self);

  const [latest] = await db
    .select({
      interactions: companionSelfSnapshots.interactions,
      capturedAt: companionSelfSnapshots.capturedAt,
    })
    .from(companionSelfSnapshots)
    .where(eq(companionSelfSnapshots.conversationId, conversationId))
    .orderBy(desc(companionSelfSnapshots.capturedAt))
    .limit(1);

  if (latest) {
    const elapsedMs = Date.now() - latest.capturedAt.getTime();
    const gainedInteractions = summary.interactions - latest.interactions;
    const due =
      elapsedMs >= minIntervalMs() || gainedInteractions >= interactionDelta();
    if (!due) return;
  }

  await db.insert(companionSelfSnapshots).values({
    conversationId,
    interactions: summary.interactions,
    summary: {
      drives: summary.drives,
      traits: summary.traits,
      interests: summary.interests,
    },
  });
}

export interface SelfHistoryPoint {
  capturedAt: Date;
  interactions: number;
  drives: { key: string; level: number; striving: number }[];
  traits: { key: string; value: number }[];
  interests: { topic: string; affinity: number; display: string }[];
}

/** The full snapshot timeline for a conversation, oldest first. */
export async function getSelfHistory(
  conversationId: number,
): Promise<SelfHistoryPoint[]> {
  const rows = await db
    .select()
    .from(companionSelfSnapshots)
    .where(eq(companionSelfSnapshots.conversationId, conversationId))
    .orderBy(asc(companionSelfSnapshots.capturedAt));

  return rows.map((r) => ({
    capturedAt: r.capturedAt,
    interactions: r.interactions,
    drives: r.summary.drives,
    traits: r.summary.traits,
    // Older snapshots predate display casing; fall back to the key so the
    // timeline always carries a non-empty display.
    interests: r.summary.interests.map((it) => ({
      topic: it.topic,
      affinity: it.affinity,
      display: it.display ?? it.topic,
    })),
  }));
}
