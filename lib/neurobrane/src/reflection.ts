import type { InnerSelf, NeuroParams, NowMs } from "./types";
import { NEURO_PARAMS } from "./params";
import {
  appendNarrativeLines,
  CORE_SELF_BLOCK_ID,
  normalizeCoreSelf,
  type CoreSelfData,
} from "./blocks/coreSelf";

/**
 * Reflection — Empiri's own thought between conversations.
 *
 * When the user returns after a longer absence the host may compose an AI
 * "reflection" (a thought Empiri had while they were away). The pure logic
 * here decides WHEN a reflection is due and folds its narrative moment into
 * the self; the AI composition itself lives host-side.
 *
 * The reflection timestamp is stored under `blocks["reflection"]` as a
 * pseudo-block envelope. It is deliberately NOT a registered block: hydrate()
 * preserves unknown block keys untouched, and project()/evolve()/summarize()
 * only visit enabled blocks, so this state survives without ever decaying or
 * leaking into the UI summary.
 */

export const REFLECTION_BLOCK_ID = "reflection";

const HOUR_MS = 3_600_000;

interface ReflectionData {
  /** Epoch ms of the last reflection composed for this self. */
  lastReflectedAt: NowMs;
}

/** When this self last reflected, or null if it never has. */
export function getLastReflectedAt(self: InnerSelf): number | null {
  const env = self.blocks[REFLECTION_BLOCK_ID];
  const at = (env?.data as Partial<ReflectionData> | undefined)?.lastReflectedAt;
  return typeof at === "number" && Number.isFinite(at) ? at : null;
}

/**
 * Whether a reflection is due: the user has been away at least
 * `thresholdHours` since the last contact, and no reflection has happened
 * during THIS absence yet (once per absence — a stamp at or after the last
 * contact means this absence has already been reflected on).
 */
export function shouldReflect(
  self: InnerSelf,
  opts: { lastContactAt: number | null; thresholdHours: number; now?: number },
): boolean {
  const { lastContactAt, thresholdHours } = opts;
  const now = opts.now ?? Date.now();
  if (lastContactAt == null || !Number.isFinite(lastContactAt)) return false;
  if ((now - lastContactAt) / HOUR_MS < thresholdHours) return false;
  const last = getLastReflectedAt(self);
  return last == null || last < lastContactAt;
}

/**
 * Fold a composed reflection into the self: append its narrative moment to
 * the core-self narrative (same overflow → archive handling as an
 * interaction fold) and stamp the reflection time.
 *
 * Deliberately does NOT bump core-self's `lastUpdatedAt`: a reflection is not
 * an interaction, so the pending time-decay must still cover the full absence
 * on the next project()/evolve().
 */
export function applyReflection(
  self: InnerSelf,
  momentLine: string,
  now: number = Date.now(),
  params: NeuroParams = NEURO_PARAMS,
): InnerSelf {
  const blocks = { ...self.blocks };

  const trimmed = momentLine.trim();
  const coreEnv = blocks[CORE_SELF_BLOCK_ID];
  if (coreEnv && trimmed.length > 0) {
    const data = normalizeCoreSelf(coreEnv.data as Partial<CoreSelfData>);
    const appended = appendNarrativeLines(data, [trimmed], now, params);
    blocks[CORE_SELF_BLOCK_ID] = {
      ...coreEnv,
      data: { ...data, narrative: appended.narrative, archive: appended.archive },
    };
  }

  blocks[REFLECTION_BLOCK_ID] = {
    version: 1,
    lastUpdatedAt: now,
    data: { lastReflectedAt: now } satisfies ReflectionData,
  };

  return { ...self, blocks };
}
