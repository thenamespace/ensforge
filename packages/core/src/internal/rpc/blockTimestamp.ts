import { Effect } from "effect";

import { multicall3Abi } from "viem";
import { getBlock } from "viem/actions";

import type { Client } from "../../client/types.js";
import type { AnyError } from "../../errors/types.js";
import type { Read } from "../../Types.js";
import { fromPromise } from "./fromPromise.js";
import { readContract } from "./readContract.js";

/**
 * Timestamp of the block a read runs at. With Multicall3 it joins the same batch as the other
 * reads, so time-based status (expiry, grace) uses chain time, not the local clock.
 */
export const blockTimestamp = (
  client: Client,
  block: Read.BlockOptions,
): Effect.Effect<bigint, AnyError> => {
  const multicall3 = client.publicClient.chain?.contracts?.multicall3?.address;
  const at =
    block.blockNumber === undefined
      ? { blockTag: block.blockTag }
      : { blockNumber: block.blockNumber };

  if (multicall3 !== undefined) {
    return readContract(client, {
      address: multicall3,
      abi: multicall3Abi,
      functionName: "getCurrentBlockTimestamp",
      ...at,
    });
  }

  return fromPromise(() =>
    getBlock(
      client.publicClient,
      block.blockNumber === undefined
        ? { blockTag: block.blockTag ?? client.config.blockTag }
        : { blockNumber: block.blockNumber },
    ),
  ).pipe(Effect.map((result) => result.timestamp));
};
