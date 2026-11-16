import { Effect, Result } from "effect";

import type { EnsforgeConfig } from "../../../../config/config.js";
import { IndexerDecodeError } from "../../../../errors/indexer-decode-error.js";
import { requestIndexer } from "../../../../internal/indexer/client.js";
import {
  V1GetRecordHistoryDocument,
  type V1GetRecordHistoryQuery,
  type V1GetRecordHistoryQueryVariables,
} from "../../../../internal/indexer/generated/v1/get-record-history.js";
import { normalizeV1RecordEvent } from "../../../../internal/indexer/normalize/record-event.js";
import type { IndexerSourcePageResult } from "../../../../internal/indexer/pagination/merge.js";
import {
  decodeIndexedBlock,
  indexerSourceFailure,
  requireIndexerData,
} from "../../../../internal/indexer/response.js";
import type { Namehash } from "../../../../schemas/hash.js";
import type {
  IndexedRecordEvent,
  RecordHistoryFilter,
  RecordHistoryOrder,
} from "../../models/record.js";
import { matchesRecordHistoryFilter } from "./filter.js";
import type { GetRecordHistoryError } from "./types.js";

const operationName = "V1GetRecordHistory";

export const queryV1RecordHistory = Effect.fn("queryV1RecordHistory")(function* (
  config: EnsforgeConfig,
  namehash: Namehash,
  filter: RecordHistoryFilter,
  order: RecordHistoryOrder,
  limit: number,
  position: string | null,
): Effect.fn.Return<IndexerSourcePageResult<IndexedRecordEvent, GetRecordHistoryError>> {
  const result = yield* Effect.gen(function* () {
    const candidates: Array<{ readonly item: IndexedRecordEvent; readonly position: string }> = [];
    let skip = position === null ? 0 : Number(position);
    let indexedBlock = 0n;
    let hasNextPage = true;

    while (candidates.length <= limit && hasNextPage) {
      // V1 cannot filter the ResolverEvent interface by concrete event type. Keep each request
      // bounded because large polymorphic event pages are expensive on hosted subgraphs.
      const batchSize = limit + 1;

      const where: V1GetRecordHistoryQueryVariables["where"] = {
        resolver_: {
          domain: namehash,
          ...(filter.resolver === undefined ? {} : { address: filter.resolver.toLowerCase() }),
        },
        ...(filter.blockAfter === undefined ? {} : { blockNumber_gt: Number(filter.blockAfter) }),
        ...(filter.blockBefore === undefined ? {} : { blockNumber_lt: Number(filter.blockBefore) }),
      };

      const response = yield* requestIndexer<
        V1GetRecordHistoryQuery,
        V1GetRecordHistoryQueryVariables
      >(config, {
        protocol: "v1",
        operationName,
        document: V1GetRecordHistoryDocument,
        variables: { first: batchSize, skip, where, orderDirection: order.direction },
      });

      const data = yield* requireIndexerData(config, "v1", operationName, response);

      indexedBlock = yield* decodeIndexedBlock(
        config,
        "v1",
        operationName,
        data["_meta"]?.block.number,
      );

      const normalized = yield* Effect.try({
        try: () =>
          data.resolverEvents.map((event, index) => ({
            item: normalizeV1RecordEvent(event, {
              network: config.network,
              indexedBlock,
              namehash,
            }),
            position: String(skip + index + 1),
          })),
        catch: (cause) =>
          new IndexerDecodeError({
            code: "INVALID_RESPONSE",
            message: "Unable to decode V1 record history",
            network: config.network,
            protocol: "v1",
            operationName,
            cause,
          }),
      });

      candidates.push(...normalized.filter(({ item }) => matchesRecordHistoryFilter(item, filter)));
      skip += data.resolverEvents.length;
      hasNextPage = data.resolverEvents.length === batchSize;
    }

    return { indexedBlock, page: { protocol: "v1" as const, candidates, hasNextPage } };
  }).pipe(Effect.result);

  if (Result.isFailure(result)) {
    return {
      status: "failed",
      error: result.failure,
      metadata: { protocol: "v1", status: "failed", failure: indexerSourceFailure(result.failure) },
    };
  }

  return {
    status: "complete",
    page: result.success.page,
    metadata: {
      protocol: "v1",
      status: "complete",
      indexedBlock: result.success.indexedBlock,
      hasNextPage: result.success.page.hasNextPage,
    },
  };
});
