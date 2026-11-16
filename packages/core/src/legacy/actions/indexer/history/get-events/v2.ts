import { Effect, Result } from "effect";

import { namehash as makeNamehash } from "viem/ens";

import type { EnsforgeConfig } from "../../../../config/config.js";
import { getIndexerRuntimeConfig } from "../../../../config/indexer-options.js";
import { IndexerDecodeError } from "../../../../errors/indexer-decode-error.js";
import { requestIndexer } from "../../../../internal/indexer/client.js";
import {
  V2GetEventsDocument,
  type V2GetEventsQuery,
  type V2GetEventsQueryVariables,
} from "../../../../internal/indexer/generated/v2/get-events.js";
import { normalizeV2Event } from "../../../../internal/indexer/normalize/event.js";
import type { IndexerSourcePageResult } from "../../../../internal/indexer/pagination/merge.js";
import {
  matchesEventFilter,
  selectedEventTypes,
} from "../../../../internal/indexer/query/event.js";
import {
  decodeIndexedBlock,
  indexerSourceFailure,
  requireIndexerData,
} from "../../../../internal/indexer/response.js";
import type { EventFilter, EventOrder, IndexedEvent } from "../../models/event.js";
import type { GetEventsError } from "./types.js";

const operationName = "V2GetEvents";

export const queryV2Events = Effect.fn("queryV2Events")(function* (
  config: EnsforgeConfig,
  filter: EventFilter,
  order: EventOrder,
  limit: number,
  position: string | null,
): Effect.fn.Return<IndexerSourcePageResult<IndexedEvent, GetEventsError>> {
  const result = yield* Effect.gen(function* () {
    const candidates: Array<{ readonly item: IndexedEvent; readonly position: string }> = [];
    let after = position;
    let indexedBlock = 0n;
    let hasNextPage = true;
    const types = selectedEventTypes(filter);

    const namehash =
      filter.namehash ?? (filter.name === undefined ? undefined : makeNamehash(filter.name));

    while (candidates.length <= limit && hasNextPage) {
      const v1Enabled = getIndexerRuntimeConfig(config.indexer).sourceStates.v1 === "enabled";

      const where: V2GetEventsQueryVariables["where"] = {
        ...(namehash === undefined ? {} : { namehash }),
        ...(v1Enabled ? { protocol: "v2" } : {}),
        ...(!v1Enabled && filter.protocols?.length === 1 ? { protocol: filter.protocols[0] } : {}),
        ...(filter.contractAddress === undefined
          ? {}
          : { contractAddress: filter.contractAddress.toLowerCase() }),
        ...(filter.blockAfter === undefined ? {} : { blockNumber_gt: Number(filter.blockAfter) }),
        ...(filter.blockBefore === undefined ? {} : { blockNumber_lt: Number(filter.blockBefore) }),
        ...(filter.timestampAfter === undefined
          ? {}
          : { timestamp_gt: Number(filter.timestampAfter) }),
        ...(filter.timestampBefore === undefined
          ? {}
          : { timestamp_lt: Number(filter.timestampBefore) }),
        ...(types === undefined ? {} : { type_in: types }),
      };

      const response = yield* requestIndexer<V2GetEventsQuery, V2GetEventsQueryVariables>(config, {
        protocol: "v2",
        operationName,
        document: V2GetEventsDocument,
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
            item: normalizeV2Event(node, { network: config.network, indexedBlock }),
            position: cursor,
          })),
        catch: (cause) =>
          new IndexerDecodeError({
            code: "INVALID_RESPONSE",
            message: "Unable to decode V2 event history",
            network: config.network,
            protocol: "v2",
            operationName,
            cause,
          }),
      });

      candidates.push(...normalized.filter(({ item }) => matchesEventFilter(item, filter)));

      const next = data.eventConnection.pageInfo.endCursor;

      hasNextPage = data.eventConnection.pageInfo.hasNextPage;

      if (hasNextPage && (next === null || next === after)) {
        return yield* new IndexerDecodeError({
          code: "INVALID_RESPONSE",
          message: "The V2 indexer returned a non-advancing event cursor",
          network: config.network,
          protocol: "v2",
          operationName,
          cause: data.eventConnection.pageInfo,
        });
      }

      after = next;
    }

    return {
      indexedBlock,
      page: {
        protocol: "v2" as const,
        candidates,
        hasNextPage: candidates.length > limit || hasNextPage,
      },
    };
  }).pipe(Effect.result);

  if (Result.isFailure(result)) {
    return {
      status: "failed",
      error: result.failure,
      metadata: {
        protocol: "v2",
        status: "failed",
        failure: indexerSourceFailure(result.failure),
      },
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
