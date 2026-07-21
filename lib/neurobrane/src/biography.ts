import {
  CORE_SELF_BLOCK_ID,
  normalizeCoreSelf,
  type ArchivedLine,
  type Chapter,
  type CoreSelfData,
} from "./blocks/coreSelf";
import { NEURO_PARAMS } from "./params";
import type { InnerSelf, NeuroParams } from "./types";

/**
 * Host-side helpers for the growing biography. The neurobrane stays pure: the
 * archive of overflowed narrative lines accumulates inside the core-self block,
 * and the HOST (api-server) decides when to condense it — typically with an AI
 * call — then folds the resulting chapter back in through `applyChapter`.
 * Nothing here touches the network or a clock you don't pass in.
 */

function readCoreSelf(self: InnerSelf): CoreSelfData | null {
  const envelope = self.blocks[CORE_SELF_BLOCK_ID];
  if (!envelope || envelope.data == null || typeof envelope.data !== "object") return null;
  return normalizeCoreSelf(envelope.data as Partial<CoreSelfData>);
}

/**
 * The archived narrative lines that are due for condensation: the full archive
 * once it has reached `condenseThreshold`, otherwise an empty array (not yet
 * worth a chapter). Oldest first, exactly as they overflowed.
 */
export function pendingBiographyLines(
  self: InnerSelf,
  params: NeuroParams = NEURO_PARAMS,
): ArchivedLine[] {
  const core = readCoreSelf(self);
  if (!core) return [];
  const { condenseThreshold } = params.coreSelf.biography;
  if (core.archive.length < condenseThreshold) return [];
  return core.archive.map((line) => ({ ...line }));
}

/**
 * Fold a condensed chapter into the self: append it to the core-self chapters
 * (kept oldest-first, capped at `maxChapters` by dropping the earliest) and
 * consume the first `consumedCount` archive entries it was condensed from.
 * Pure and stale-safe: if the archive shrank or grew since the caller read it,
 * at most the whole archive is consumed, never more.
 */
export function applyChapter(
  self: InnerSelf,
  chapter: Chapter,
  consumedCount: number,
  params: NeuroParams = NEURO_PARAMS,
  now: number = Date.now(),
): InnerSelf {
  const envelope = self.blocks[CORE_SELF_BLOCK_ID];
  const core = readCoreSelf(self);
  if (!envelope || !core) return self;

  const { maxChapters } = params.coreSelf.biography;
  const consume = Math.max(0, Math.min(consumedCount, core.archive.length));

  const consumedLines = core.archive.slice(0, consume);

  // Capture the archive lines that are being consumed so users can later
  // revisit the raw memories that were condensed into this chapter.
  const sourceLines = consumedLines.map((l) => l.text);

  // Use the earliest CREATION time of the consumed lines as the chapter's
  // display date — this reflects when the memories were originally made, not
  // when they overflowed into the archive. Falls back to the archive drop-time
  // (`at`) for entries that pre-date creation-time tracking.
  const memoryDate =
    consumedLines.length > 0
      ? Math.min(...consumedLines.map((l) => l.createdAt ?? l.at))
      : undefined;

  const newChapter: Chapter = {
    ...chapter,
    themes: [...chapter.themes],
    ...(sourceLines.length > 0 ? { sourceLines } : {}),
    ...(memoryDate !== undefined ? { memoryDate } : {}),
  };

  const chapters = [...core.chapters, newChapter]
    .sort((a, b) => a.from - b.from)
    .slice(-maxChapters);

  const data: CoreSelfData = {
    ...core,
    archive: core.archive.slice(consume),
    chapters,
  };

  return {
    ...self,
    blocks: {
      ...self.blocks,
      [CORE_SELF_BLOCK_ID]: { ...envelope, lastUpdatedAt: now, data },
    },
  };
}
