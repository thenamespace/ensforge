import type { BlockTag } from "viem";

export type BlockParameters =
  | {
      readonly blockNumber?: bigint;
      readonly blockTag?: never;
    }
  | {
      readonly blockNumber?: never;
      readonly blockTag?: BlockTag;
    };

export const getBlockReference = ({ blockNumber, blockTag }: BlockParameters): BlockParameters => {
  if (blockNumber !== undefined) return { blockNumber };

  if (blockTag !== undefined) return { blockTag };

  return {};
};
