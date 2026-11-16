import { Effect, Result } from "effect";

import type { EnsforgeConfig } from "../../../../config/config.js";
import { IndexerDecodeError } from "../../../../errors/indexer-decode-error.js";
import { requestIndexer } from "../../../../internal/indexer/client.js";
import {
  V2GetNamesDocument,
  type V2GetNamesQuery,
  type V2GetNamesQueryVariables,
} from "../../../../internal/indexer/generated/v2/get-names.js";
import { normalizeV2IndexerName } from "../../../../internal/indexer/normalize/v2-name.js";
import type { IndexerSourcePageResult } from "../../../../internal/indexer/pagination/merge.js";
import {
  matchesNameFilter,
  type V2NameWhere,
} from "../../../../internal/indexer/query/name-filter.js";
import { compileV2NameOrder } from "../../../../internal/indexer/query/name-order.js";
import {
  decodeIndexedBlock,
  indexerSourceFailure,
  requireIndexerData,
} from "../../../../internal/indexer/response.js";
import type { IndexedName } from "../../models/name.js";
import type { NameFilter, NameOrder } from "../../models/query.js";
import type { GetNamesError } from "./types.js";

const operationName = "V2GetNames";

export const queryV2Names = Effect.fn("queryV2Names")(function* (
  config: EnsforgeConfig,
  where: V2NameWhere,
  filter: NameFilter,
  requiresPostFilter: boolean,
  order: NameOrder,
  limit: number,
  position: string | null,
): Effect.fn.Return<IndexerSourcePageResult<IndexedName, GetNamesError>> {
  const result = yield* Effect.gen(function* () {
    const candidates: Array<{ readonly item: IndexedName; readonly position: string }> = [];
    let after = position;
    let indexedBlock = 0n;
    let hasNextPage = true;

    while (candidates.length <= limit && hasNextPage) {
      const variables = {
        first: limit + 1,
        after,
        where,
        ...compileV2NameOrder(order),
      } as V2GetNamesQueryVariables;

      const response = yield* requestIndexer<V2GetNamesQuery, V2GetNamesQueryVariables>(config, {
        protocol: "v2",
        operationName,
        document: V2GetNamesDocument,
        variables,
      });

      const data = yield* requireIndexerData(config, "v2", operationName, response);

      indexedBlock = yield* decodeIndexedBlock(
        config,
        "v2",
        operationName,
        data["_meta"].block.number,
      );

      const normalized = yield* Effect.all(
        data.domainConnection.edges.map(({ cursor, node }) =>
          normalizeV2IndexerName(node, {
            network: config.network,
            protocol: "v2",
            indexedBlock,
            operationName,
          }).pipe(Effect.map((item) => ({ item, position: cursor }))),
        ),
        { concurrency: "unbounded" },
      );

      candidates.push(
        ...(requiresPostFilter
          ? normalized.filter(({ item }) => matchesNameFilter(item, filter))
          : normalized),
      );

      const next = data.domainConnection.pageInfo.endCursor;

      hasNextPage = data.domainConnection.pageInfo.hasNextPage;

      if (hasNextPage && (next === null || next === after)) {
        return yield* new IndexerDecodeError({
          code: "INVALID_RESPONSE",
          message: "The V2 indexer returned a non-advancing pagination cursor",
          network: config.network,
          protocol: "v2",
          operationName,
          cause: data.domainConnection.pageInfo,
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
