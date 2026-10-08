import { Effect, Result } from "effect";

import type { EnsforgeConfig } from "../../../../config/config.js";
import { IndexerPaginationError } from "../../../../errors/indexer-pagination-error.js";
import { requestIndexer } from "../../../../internal/indexer/client.js";
import {
  V2GetSubnamesDocument,
  type V2GetSubnamesQuery,
  type V2GetSubnamesQueryVariables,
} from "../../../../internal/indexer/generated/v2/get-subnames.js";
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
import type { NormalizedName } from "../../../../schemas/name.js";
import type { IndexedName } from "../../models/name.js";
import type { NameFilter, NameOrder } from "../../models/query.js";
import type { GetSubnamesError } from "./types.js";

const operationName = "V2GetSubnames";

export const queryV2Subnames = Effect.fn("queryV2Subnames")(function* (
  config: EnsforgeConfig,
  parent: NormalizedName,
  where: V2NameWhere,
  filter: NameFilter,
  order: NameOrder,
  limit: number,
  position: string | null,
): Effect.fn.Return<IndexerSourcePageResult<IndexedName, GetSubnamesError>> {
  const result = yield* Effect.gen(function* () {
    let skip = yield* Effect.try({
      try: () => {
        const value = position === null ? 0 : Number(position);

        if (!Number.isSafeInteger(value) || value < 0) throw new Error("Invalid offset");

        return value;
      },
      catch: (cause) =>
        new IndexerPaginationError({
          code: "INVALID_CURSOR",
          message: "The V2 subname cursor contains an invalid position",
          cause,
        }),
    });

    const candidates: Array<{ readonly item: IndexedName; readonly position: string }> = [];
    let indexedBlock = 0n;
    let hasNextPage = true;
    let previousPage: string | undefined;

    while (candidates.length <= limit && hasNextPage) {
      const response = yield* requestIndexer<V2GetSubnamesQuery, V2GetSubnamesQueryVariables>(
        config,
        {
          protocol: "v2",
          operationName,
          document: V2GetSubnamesDocument,
          variables: {
            id: parent,
            first: limit + 1,
            skip,
            where,
            ...compileV2NameOrder(order),
          } as V2GetSubnamesQueryVariables,
        },
      );

      const data = yield* requireIndexerData(config, "v2", operationName, response);
      indexedBlock = yield* decodeIndexedBlock(
        config,
        "v2",
        operationName,
        data["_meta"].block.number,
      );

      const labels = data.domain?.subregistry?.labels ?? [];
      // Some deployments return the entire label set despite first/skip.
      const window = labels.length > limit + 1 ? labels.slice(skip, skip + limit + 1) : labels;
      const pageIdentity = JSON.stringify(window.map((node) => node.id));

      if (window.length > 0 && pageIdentity === previousPage) {
        return yield* new IndexerPaginationError({
          code: "INVALID_CURSOR",
          message: "The V2 indexer returned a non-advancing subname page",
        });
      }

      previousPage = pageIdentity;

      const normalized = yield* Effect.all(
        window.map((node, index) =>
          normalizeV2IndexerName(node, {
            network: config.network,
            protocol: "v2",
            indexedBlock,
            operationName,
          }).pipe(Effect.map((item) => ({ item, position: String(skip + index + 1) }))),
        ),
        { concurrency: "unbounded" },
      );

      candidates.push(...normalized.filter(({ item }) => matchesNameFilter(item, filter)));
      skip += window.length;
      hasNextPage = labels.length > limit + 1 ? skip < labels.length : window.length > limit;
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
