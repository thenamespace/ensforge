import { Effect } from "effect";

import { defineNoParametersAction } from "../../../action/action.js";
import type { EnsforgeConfig } from "../../../config/config.js";
import { getIndexerSourceStatus } from "./source.js";
import type { IndexerStatus as IndexerStatusType } from "./types.js";

const getIndexerStatusEffect = Effect.fn("ensforge.getIndexerStatus")(function* (
  config: EnsforgeConfig,
): Effect.fn.Return<IndexerStatusType> {
  const sources = yield* Effect.all(
    [getIndexerSourceStatus(config, "v1"), getIndexerSourceStatus(config, "v2")] as const,
    { concurrency: "unbounded" },
  );

  return { network: config.network, sources };
});

export const getIndexerStatus = defineNoParametersAction(getIndexerStatusEffect);

export {
  DisabledIndexerSourceStatus,
  FailedIndexerSourceStatus,
  IndexerBlock,
  IndexerSourceFailure,
  IndexerSourceStatus,
  IndexerStatus,
  ReadyIndexerSourceStatus,
  UnavailableIndexerSourceStatus,
  type IndexerBlock as IndexerBlockType,
  type IndexerSourceFailure as IndexerSourceFailureType,
  type IndexerSourceStatus as IndexerSourceStatusType,
  type IndexerStatus as IndexerStatusType,
} from "./types.js";
