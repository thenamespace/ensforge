import { Effect, Schema } from "effect";

import { getAddress } from "viem";

import { defineAction } from "../../../../action/action.js";
import type { EnsforgeConfig } from "../../../../config/config.js";
import { IndexerConfigError } from "../../../../errors/indexer-config-error.js";
import { IndexerFilterError } from "../../../../errors/indexer-filter-error.js";
import { requestIndexer } from "../../../../internal/indexer/client.js";
import {
  V2GetRegistriesForAddressDocument,
  type V2GetRegistriesForAddressQuery,
  type V2GetRegistriesForAddressQueryVariables,
} from "../../../../internal/indexer/generated/v2/get-registries-for-address.js";
import { normalizeV2Registry } from "../../../../internal/indexer/normalize/registry.js";
import {
  decodeIndexerCursor,
  encodeIndexerCursor,
  makeIndexerCursorBinding,
} from "../../../../internal/indexer/pagination/cursor.js";
import { decodeLocalOffset } from "../../../../internal/indexer/pagination/local-offset.js";
import { decodeIndexedBlock, requireIndexerData } from "../../../../internal/indexer/response.js";
import { getV2IndexerUnsupported } from "../../../../internal/indexer/v2-support.js";
import {
  GetRegistriesForAddressParameters as GetRegistriesForAddressParametersSchema,
  type GetRegistriesForAddressError,
  type GetRegistriesForAddressParameters,
  type GetRegistriesForAddressResult,
} from "./types.js";

const getRegistriesForAddressEffect = Effect.fn("ensforge.getRegistriesForAddress")(function* (
  config: EnsforgeConfig,
  parameters: GetRegistriesForAddressParameters,
): Effect.fn.Return<GetRegistriesForAddressResult, GetRegistriesForAddressError> {
  if (!config.indexer.enabled) {
    return yield* new IndexerConfigError({
      code: "INDEXER_DISABLED",
      message: "Indexer actions are disabled for this configuration",
    });
  }

  const decoded = yield* Schema.decodeUnknownEffect(GetRegistriesForAddressParametersSchema)(
    parameters,
  ).pipe(
    Effect.mapError(
      () =>
        new IndexerFilterError({
          code: "INVALID_FILTER",
          message: "The registry owner query parameters are invalid",
        }),
    ),
  );

  const unsupported = getV2IndexerUnsupported(config);

  if (unsupported !== null) return unsupported;

  const address = getAddress(decoded.address);
  const pageSize = decoded.pageSize ?? Math.min(20, config.indexer.maximumPageSize);

  if (pageSize > config.indexer.maximumPageSize) {
    return yield* new IndexerFilterError({
      code: "INVALID_FILTER",
      message: `pageSize cannot exceed ${config.indexer.maximumPageSize}`,
    });
  }

  const binding = makeIndexerCursorBinding(config, "getRegistriesForAddress", { address }, null);

  const positions =
    decoded.cursor === undefined
      ? { v1: { position: null, exhausted: true }, v2: { position: null, exhausted: false } }
      : (yield* decodeIndexerCursor(decoded.cursor, binding)).sources;

  const offset = yield* decodeLocalOffset(positions.v2.position, "registry owner");
  const operationName = "V2GetRegistriesForAddress";

  const response = yield* requestIndexer<
    V2GetRegistriesForAddressQuery,
    V2GetRegistriesForAddressQueryVariables
  >(config, {
    protocol: "v2",
    operationName,
    document: V2GetRegistriesForAddressDocument,
    variables: { owner: address.toLowerCase() },
  });

  const data = yield* requireIndexerData(config, "v2", operationName, response);

  const indexedBlock = yield* decodeIndexedBlock(
    config,
    "v2",
    operationName,
    data["_meta"].block.number,
  );

  const window = data.registries.slice(offset, offset + pageSize);

  const items = yield* Effect.all(
    window.map((registry) =>
      normalizeV2Registry(registry, {
        network: config.network,
        protocol: "v2",
        indexedBlock,
        operationName,
      }),
    ),
    { concurrency: "unbounded" },
  );

  const nextOffset = offset + window.length;
  const hasNextPage = nextOffset < data.registries.length;

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

export const getRegistriesForAddress = defineAction(getRegistriesForAddressEffect);

export {
  GetRegistriesForAddressPage,
  GetRegistriesForAddressParameters,
  GetRegistriesForAddressResult,
  type GetRegistriesForAddressError,
  type GetRegistriesForAddressPage as GetRegistriesForAddressPageType,
  type GetRegistriesForAddressParameters as GetRegistriesForAddressParametersType,
  type GetRegistriesForAddressResult as GetRegistriesForAddressResultType,
} from "./types.js";
