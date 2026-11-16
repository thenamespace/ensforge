import { Effect, Schema } from "effect";

import { getAddress } from "viem";

import { defineAction } from "../../../../action/action.js";
import type { EnsforgeConfig } from "../../../../config/config.js";
import { IndexerConfigError } from "../../../../errors/indexer-config-error.js";
import { IndexerFilterError } from "../../../../errors/indexer-filter-error.js";
import { requestIndexer } from "../../../../internal/indexer/client.js";
import {
  V2GetResolversForAddressDocument,
  type V2GetResolversForAddressQuery,
  type V2GetResolversForAddressQueryVariables,
} from "../../../../internal/indexer/generated/v2/get-resolvers-for-address.js";
import { normalizeV2OwnedResolver } from "../../../../internal/indexer/normalize/resolver.js";
import {
  decodeIndexerCursor,
  encodeIndexerCursor,
  makeIndexerCursorBinding,
} from "../../../../internal/indexer/pagination/cursor.js";
import { decodeLocalOffset } from "../../../../internal/indexer/pagination/local-offset.js";
import { decodeIndexedBlock, requireIndexerData } from "../../../../internal/indexer/response.js";
import { getV2IndexerUnsupported } from "../../../../internal/indexer/v2-support.js";
import {
  GetResolversForAddressParameters as GetResolversForAddressParametersSchema,
  type GetResolversForAddressError,
  type GetResolversForAddressParameters,
  type GetResolversForAddressResult,
} from "./types.js";

const getResolversForAddressEffect = Effect.fn("ensforge.getResolversForAddress")(function* (
  config: EnsforgeConfig,
  parameters: GetResolversForAddressParameters,
): Effect.fn.Return<GetResolversForAddressResult, GetResolversForAddressError> {
  if (!config.indexer.enabled) {
    return yield* new IndexerConfigError({
      code: "INDEXER_DISABLED",
      message: "Indexer actions are disabled for this configuration",
    });
  }

  const decoded = yield* Schema.decodeUnknownEffect(GetResolversForAddressParametersSchema)(
    parameters,
  ).pipe(
    Effect.mapError(
      () =>
        new IndexerFilterError({
          code: "INVALID_FILTER",
          message: "The resolver owner query parameters are invalid",
        }),
    ),
  );

  const unsupported = getV2IndexerUnsupported(config);

  if (unsupported !== null) return unsupported;

  const owner = getAddress(decoded.address);
  const pageSize = decoded.pageSize ?? Math.min(20, config.indexer.maximumPageSize);

  if (pageSize > config.indexer.maximumPageSize) {
    return yield* new IndexerFilterError({
      code: "INVALID_FILTER",
      message: `pageSize cannot exceed ${config.indexer.maximumPageSize}`,
    });
  }

  const binding = makeIndexerCursorBinding(config, "getResolversForAddress", { owner }, null);

  const positions =
    decoded.cursor === undefined
      ? { v1: { position: null, exhausted: true }, v2: { position: null, exhausted: false } }
      : (yield* decodeIndexerCursor(decoded.cursor, binding)).sources;

  const offset = yield* decodeLocalOffset(positions.v2.position, "resolver owner");
  const operationName = "V2GetResolversForAddress";

  const response = yield* requestIndexer<
    V2GetResolversForAddressQuery,
    V2GetResolversForAddressQueryVariables
  >(config, {
    protocol: "v2",
    operationName,
    document: V2GetResolversForAddressDocument,
    variables: { owner: owner.toLowerCase(), protocol: "v2" },
  });

  const data = yield* requireIndexerData(config, "v2", operationName, response);

  const indexedBlock = yield* decodeIndexedBlock(
    config,
    "v2",
    operationName,
    data["_meta"].block.number,
  );

  const window = data.resolversByOwner.slice(offset, offset + pageSize);

  const items = yield* Effect.all(
    window.map((resolver) =>
      normalizeV2OwnedResolver(owner, resolver, {
        network: config.network,
        protocol: "v2",
        indexedBlock,
        operationName,
      }),
    ),
    { concurrency: "unbounded" },
  );

  const nextOffset = offset + window.length;
  const hasNextPage = nextOffset < data.resolversByOwner.length;

  const cursor = hasNextPage
    ? yield* encodeIndexerCursor(binding, {
        v1: { position: null, exhausted: true },
        v2: { position: String(nextOffset), exhausted: false },
      })
    : null;

  return {
    status: "supported",
    value: {
      items,
      pageInfo: { cursor, hasNextPage },
      sources: [{ protocol: "v2", status: "complete", indexedBlock, hasNextPage }],
    },
  };
});

export const getResolversForAddress = defineAction(getResolversForAddressEffect);

export {
  GetResolversForAddressPage,
  GetResolversForAddressParameters,
  GetResolversForAddressResult,
  type GetResolversForAddressError,
  type GetResolversForAddressPage as GetResolversForAddressPageType,
  type GetResolversForAddressParameters as GetResolversForAddressParametersType,
  type GetResolversForAddressResult as GetResolversForAddressResultType,
} from "./types.js";
