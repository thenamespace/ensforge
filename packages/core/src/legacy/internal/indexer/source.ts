import type { EnsforgeConfig } from "../../config/config.js";
import type { IndexerProtocol } from "../../config/indexer-options.js";
import { getIndexerRuntimeConfig } from "../../config/indexer-options.js";
import { IndexerConfigError } from "../../errors/indexer-config-error.js";
import { IndexerUnavailableError } from "../../errors/indexer-unavailable-error.js";

export interface IndexerSource {
  readonly network: EnsforgeConfig["network"];
  readonly protocol: IndexerProtocol;
  readonly endpoint: string;
  readonly identity: string;
}

export const resolveIndexerSource = (
  config: EnsforgeConfig,
  protocol: IndexerProtocol,
): IndexerSource => {
  if (!config.indexer.enabled) {
    throw new IndexerConfigError({
      code: "INDEXER_DISABLED",
      message: "Indexer actions are disabled for this configuration",
    });
  }

  const state = getIndexerRuntimeConfig(config.indexer).sourceStates[protocol];

  if (state === "disabled") {
    throw new IndexerConfigError({
      code: "SOURCE_DISABLED",
      message: `The ${protocol} indexer is disabled on ${config.network}`,
    });
  }

  const endpoint = config.indexer.endpoints[protocol];

  if (endpoint === null) {
    throw new IndexerUnavailableError({
      code: "SOURCE_UNAVAILABLE",
      message: `The ${protocol} indexer is unavailable on ${config.network}`,
      network: config.network,
      protocol,
    });
  }

  return Object.freeze({
    network: config.network,
    protocol,
    endpoint,
    identity: `${config.network}:${protocol}`,
  });
};
