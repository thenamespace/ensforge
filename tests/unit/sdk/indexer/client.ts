import { indexerActions } from "@ensforge/sdk/internal/actions/decorators";
import { create } from "@ensforge/sdk/internal/client/create";
import type { Indexer } from "@ensforge/sdk/internal/indexer/Indexer";
import { noRpc, scriptedTransport } from "@ensforge/test-harness";
import { type Chain } from "viem";
import { mainnet } from "viem/chains";

/** An ensforge client with `indexer` actions that must never touch the chain. */
export const clientWith = (indexer: Indexer | undefined, chain: Chain = mainnet) =>
  create({
    chain,
    transports: { [chain.id]: scriptedTransport(noRpc).transport },
    publicRpc: false,
    indexer,
  }).extend(indexerActions());
