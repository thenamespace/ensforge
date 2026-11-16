import { Effect, Result } from "effect";

import type { EnsforgeConfig } from "../../../../config/config.js";
import { IndexerDecodeError } from "../../../../errors/indexer-decode-error.js";
import { requestIndexer } from "../../../../internal/indexer/client.js";
import {
  V2GetRecordHistoryDocument,
  type V2GetRecordHistoryQuery,
  type V2GetRecordHistoryQueryVariables,
} from "../../../../internal/indexer/generated/v2/get-record-history.js";
import { normalizeV2RecordEvent } from "../../../../internal/indexer/normalize/record-event.js";
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
import { matchesRecordHistoryFilter, recordEventTypes } from "./filter.js";
import type { GetRecordHistoryError } from "./types.js";

const operationName = "V2GetRecordHistory";

export const queryV2RecordHistory = Effect.fn("queryV2RecordHistory")(function* (
  config: EnsforgeConfig,
  namehash: Namehash,
  filter: RecordHistoryFilter,
  order: RecordHistoryOrder,
  limit: number,
  position: string | null,
  onlyV2: boolean,
): Effect.fn.Return<IndexerSourcePageResult<IndexedRecordEvent, GetRecordHistoryError>> {
  const result = yield* Effect.gen(function* () {
    const candidates: Array<{ readonly item: IndexedRecordEvent; readonly position: string }> = [];
    let after = position;
    let indexedBlock = 0n;
    let hasNextPage = true;

    const selectedTypes = (filter.kinds ?? Object.keys(recordEventTypes)).flatMap(
      (kind) => recordEventTypes[kind as keyof typeof recordEventTypes],
    );

    while (candidates.length <= limit && hasNextPage) {
      const where: V2GetRecordHistoryQueryVariables["where"] = {
        namehash,
        ...(onlyV2 ? { protocol: "v2" } : {}),
        type_in: selectedTypes,
        ...(filter.blockAfter === undefined ? {} : { blockNumber_gt: Number(filter.blockAfter) }),
        ...(filter.blockBefore === undefined ? {} : { blockNumber_lt: Number(filter.blockBefore) }),
        ...(filter.timestampAfter === undefined
          ? {}
          : { timestamp_gt: Number(filter.timestampAfter) }),
        ...(filter.timestampBefore === undefined
          ? {}
          : { timestamp_lt: Number(filter.timestampBefore) }),
      };

      const response = yield* requestIndexer<
        V2GetRecordHistoryQuery,
        V2GetRecordHistoryQueryVariables
      >(config, {
        protocol: "v2",
        operationName,
        document: V2GetRecordHistoryDocument,
        variables: {
          first: Math.max(limit + 1, 25),
          after,
          where,
          orderDirection: order.direction,
        },
      });

      const data = yield* requireIndexerData(config, "v2", operationName, response);

      indexedBlock = yield* decodeIndexedBlock(
        config,
        "v2",
        operationName,
        data["_meta"].block.number,
      );

      const normalized = yield* Effect.try({
        try: () =>
          data.eventConnection.edges.map(({ cursor, node }) => ({
            item: normalizeV2RecordEvent(node, { network: config.network, indexedBlock, namehash }),
            position: cursor,
          })),
        catch: (cause) =>
          new IndexerDecodeError({
            code: "INVALID_RESPONSE",
            message: "Unable to decode V2 record history",
            network: config.network,
            protocol: "v2",
            operationName,
            cause,
          }),
      });

      candidates.push(...normalized.filter(({ item }) => matchesRecordHistoryFilter(item, filter)));

      const next = data.eventConnection.pageInfo.endCursor;

      hasNextPage = data.eventConnection.pageInfo.hasNextPage;

      if (hasNextPage && (next === null || next === after)) {
        return yield* new IndexerDecodeError({
          code: "INVALID_RESPONSE",
          message: "The V2 indexer returned a non-advancing record-history cursor",
          network: config.network,
          protocol: "v2",
          operationName,
          cause: data.eventConnection.pageInfo,
        });
      }

      after = next;
    }

    return { indexedBlock, page: { protocol: "v2" as const, candidates, hasNextPage } };
  }).pipe(Effect.result);

  if (Result.isFailure(result)) {
    return {
      status: "failed",
      error: result.failure,
      metadata: { protocol: "v2", status: "failed", failure: indexerSourceFailure(result.failure) },
    };
  }

  return {
    status: "complete",
    page: result.success.page,
    metadata: {
      protocol: "v2",
      status: "complete",
      indexedBlock: result.success.indexedBlock,
      hasNextPage: result.success.page.hasNextPage,
    },
  };
});
