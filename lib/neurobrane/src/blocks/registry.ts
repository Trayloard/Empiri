import type { BlockDefinition, NeuroParams } from "../types";
import { coreSelfBlock, CORE_SELF_BLOCK_ID } from "./coreSelf";
import { drivesBlock, DRIVES_BLOCK_ID } from "./drives";

/**
 * Every known building block, keyed by id. To add a block: implement
 * `BlockDefinition`, register it here, and add its id to `NEURO_PARAMS.enabledBlocks`.
 * No host logic needs to change.
 */
export const ALL_BLOCKS: Record<string, BlockDefinition<any>> = {
  [CORE_SELF_BLOCK_ID]: coreSelfBlock,
  [DRIVES_BLOCK_ID]: drivesBlock,
};

/** The active blocks for the given params, in declared fold order. */
export function enabledBlocks(params: NeuroParams): Array<BlockDefinition<any>> {
  const out: Array<BlockDefinition<any>> = [];
  for (const id of params.enabledBlocks) {
    const block = ALL_BLOCKS[id];
    if (block) out.push(block);
  }
  return out;
}
