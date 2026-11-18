import type { Read } from "../../Types.js";

/**
 * The block a read runs at, as viem takes it: the block number when one is given, otherwise the
 * tag. `options` may be a whole read's options; only the block fields are kept.
 */
export const blockAt = (options: Read.BlockOptions) =>
  options.blockNumber === undefined
    ? { blockTag: options.blockTag }
    : { blockNumber: options.blockNumber };
