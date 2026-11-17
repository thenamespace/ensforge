import { noRpc, scriptedTransport } from "@ensforge/test-harness";
import { createPublicClient, type Chain } from "viem";
import { mainnet } from "viem/chains";

import { indexerActions } from "#/actions/decorators";
import { create } from "#/client/create";
import type { Indexer } from "#/indexer/Indexer";

/** An ensforge client with `indexer` actions that must never touch the chain. */
export const clientWith = (indexer: Indexer | undefined, chain: Chain = mainnet) =>
  create({
    publicClient: createPublicClient({ chain, transport: scriptedTransport(noRpc).transport }),
    indexer,
  }).extend(indexerActions());
