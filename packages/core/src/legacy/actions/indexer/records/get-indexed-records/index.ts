import { Effect } from "effect";

import { defineAction } from "../../../../action/action.js";
import type { EnsforgeConfig } from "../../../../config/config.js";
import {
  getIndexerRuntimeConfig,
  type IndexerProtocol,
  type IndexerSourceState,
} from "../../../../config/indexer-options.js";
import { IndexerConfigError } from "../../../../errors/indexer-config-error.js";
import { decodeIndexerNameIdentity } from "../../../../internal/indexer/name-identity.js";
import {
  collectIndexerSourcePages,
  type IndexerSourcePageResult,
} from "../../../../internal/indexer/pagination/merge.js";
import type { IndexedResolverBinding } from "../../models/record.js";
import { queryIndexedRecordsSource } from "./source.js";
import type {
  GetIndexedRecordsError,
  GetIndexedRecordsParameters,
  GetIndexedRecordsResult,
} from "./types.js";

const sourceStateResult = (
  protocol: IndexerProtocol,
  state: Exclude<IndexerSourceState, "enabled">,
): IndexerSourcePageResult<IndexedResolverBinding, GetIndexedRecordsError> => ({
  status: state,
  metadata: { protocol, status: state },
});

const getIndexedRecordsEffect = Effect.fn("ensforge.getIndexedRecords")(function* (
  config: EnsforgeConfig,
  parameters: GetIndexedRecordsParameters,
): Effect.fn.Return<GetIndexedRecordsResult, GetIndexedRecordsError> {
  if (!config.indexer.enabled) {
    return yield* new IndexerConfigError({
      code: "INDEXER_DISABLED",
      message: "Indexer actions are disabled for this configuration",
    });
  }

  const lookup = yield* decodeIndexerNameIdentity(parameters);
  const states = getIndexerRuntimeConfig(config.indexer).sourceStates;

  const results = yield* Effect.all(
    (["v1", "v2"] as const).map((protocol) =>
      states[protocol] === "enabled"
        ? queryIndexedRecordsSource(config, protocol, lookup)
        : Effect.succeed(sourceStateResult(protocol, states[protocol])),
    ),
    { concurrency: "unbounded" },
  );

  const collected = yield* collectIndexerSourcePages(results, config.indexer.failureMode);

  return {
    namehash: lookup.namehash,
    authoritative: false,
    bindings: collected.pages.flatMap(({ candidates }) => candidates.map(({ item }) => item)),
    sources: collected.sources,
  };
});

export const getIndexedRecords = defineAction(getIndexedRecordsEffect);

export type {
  GetIndexedRecordsError,
  GetIndexedRecordsParameters,
  GetIndexedRecordsResult,
} from "./types.js";
