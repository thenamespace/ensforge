import type { IndexerProtocol } from "../../../config/indexer-options.js";
import type { EnsNetworkId } from "../../../config/network.js";

export interface IndexerNormalizationContext {
  readonly network: EnsNetworkId;
  readonly protocol: IndexerProtocol;
  readonly indexedBlock: bigint;
  readonly operationName: string;
}
