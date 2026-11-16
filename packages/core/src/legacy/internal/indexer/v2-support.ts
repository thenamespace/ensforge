import type { V2IndexerUnsupported } from "../../actions/indexer/models/v2-support.js";
import type { EnsforgeConfig } from "../../config/config.js";
import { getIndexerRuntimeConfig } from "../../config/indexer-options.js";

export const getV2IndexerUnsupported = (config: EnsforgeConfig): V2IndexerUnsupported | null => {
  const state = getIndexerRuntimeConfig(config.indexer).sourceStates.v2;

  if (state === "enabled") return null;

  return {
    status: "unsupported",
    network: config.network,
    reason: state === "disabled" ? "V2_INDEXER_DISABLED" : "V2_INDEXER_UNAVAILABLE",
  };
};
