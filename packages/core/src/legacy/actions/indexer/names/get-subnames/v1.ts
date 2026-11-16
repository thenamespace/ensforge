import { Effect, Result } from "effect";

import { namehash } from "viem/ens";

import type { EnsforgeConfig } from "../../../../config/config.js";
import type { IndexerPaginationError } from "../../../../errors/indexer-pagination-error.js";
import { requestIndexer } from "../../../../internal/indexer/client.js";
import {
  V1GetSubnamesDocument,
  type V1GetSubnamesQuery,
  type V1GetSubnamesQueryVariables,
} from "../../../../internal/indexer/generated/v1/get-subnames.js";
import { normalizeV1IndexedName } from "../../../../internal/indexer/normalize/v1-name.js";
import type { IndexerSourcePageResult } from "../../../../internal/indexer/pagination/merge.js";
import {
  combineV1NameWhere,
  compileV1NamePosition,
  decodeV1NamePosition,
  encodeV1NamePosition,
} from "../../../../internal/indexer/pagination/v1-keyset.js";
import type { V1NameWhere } from "../../../../internal/indexer/query/name-filter.js";
import { compileV1NameOrder } from "../../../../internal/indexer/query/name-order.js";
import {
  decodeIndexedBlock,
  indexerSourceFailure,
  requireIndexerData,
} from "../../../../internal/indexer/response.js";
import type { NormalizedName } from "../../../../schemas/name.js";
import type { IndexedName } from "../../models/name.js";
import type { NameOrder } from "../../models/query.js";
import type { GetSubnamesError } from "./types.js";

const operationName = "V1GetSubnames";

export const queryV1Subnames = Effect.fn("queryV1Subnames")(function* (
  config: EnsforgeConfig,
  parent: NormalizedName,
  where: V1NameWhere,
  order: NameOrder,
  limit: number,
  position: string | null,
): Effect.fn.Return<
  IndexerSourcePageResult<IndexedName, GetSubnamesError>,
  IndexerPaginationError
> {
  const decodedPosition =
    position === null ? undefined : yield* decodeV1NamePosition(position, order);

  const result = yield* Effect.gen(function* () {
    const response = yield* requestIndexer<V1GetSubnamesQuery, V1GetSubnamesQueryVariables>(
      config,
      {
        protocol: "v1",
        operationName,
        document: V1GetSubnamesDocument,
        variables: {
          id: namehash(parent),
          first: limit + 1,
          where: combineV1NameWhere(
            where,
            decodedPosition === undefined
              ? undefined
              : compileV1NamePosition(decodedPosition, order),
          ),
          ...compileV1NameOrder(order),
        } as V1GetSubnamesQueryVariables,
      },
    );

    const data = yield* requireIndexerData(config, "v1", operationName, response);

    const indexedBlock = yield* decodeIndexedBlock(
      config,
      "v1",
      operationName,
      data["_meta"].block.number,
    );

    const names = yield* Effect.all(
      (data.domain?.subdomains ?? []).map((wire) =>
        normalizeV1IndexedName(wire, {
          network: config.network,
          protocol: "v1",
          indexedBlock,
          operationName,
        }),
      ),
      { concurrency: "unbounded" },
    );

    return {
      indexedBlock,
      page: {
        protocol: "v1" as const,
        candidates: names.map((item) => ({ item, position: encodeV1NamePosition(item, order) })),
        hasNextPage: names.length > limit,
      },
    };
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
