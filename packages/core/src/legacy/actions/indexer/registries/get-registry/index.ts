import { Effect, Schema } from "effect";

import { getAddress } from "viem";
import { normalize } from "viem/ens";

import { defineAction } from "../../../../action/action.js";
import type { EnsforgeConfig } from "../../../../config/config.js";
import { IndexerConfigError } from "../../../../errors/indexer-config-error.js";
import { IndexerFilterError } from "../../../../errors/indexer-filter-error.js";
import { requestIndexer } from "../../../../internal/indexer/client.js";
import {
  V2GetRegistryByAddressDocument,
  type V2GetRegistryByAddressQuery,
  type V2GetRegistryByAddressQueryVariables,
  V2GetRegistryByNameDocument,
  type V2GetRegistryByNameQuery,
  type V2GetRegistryByNameQueryVariables,
} from "../../../../internal/indexer/generated/v2/get-registry.js";
import { normalizeV2Registry } from "../../../../internal/indexer/normalize/registry.js";
import { decodeIndexedBlock, requireIndexerData } from "../../../../internal/indexer/response.js";
import { getV2IndexerUnsupported } from "../../../../internal/indexer/v2-support.js";
import {
  GetRegistryParameters as GetRegistryParametersSchema,
  type GetRegistryError,
  type GetRegistryParameters,
  type GetRegistryResult,
} from "./types.js";

const getRegistryEffect = Effect.fn("ensforge.getIndexedRegistry")(function* (
  config: EnsforgeConfig,
  parameters: GetRegistryParameters,
): Effect.fn.Return<GetRegistryResult, GetRegistryError> {
  if (!config.indexer.enabled) {
    return yield* new IndexerConfigError({
      code: "INDEXER_DISABLED",
      message: "Indexer actions are disabled for this configuration",
    });
  }

  const decoded = yield* Schema.decodeUnknownEffect(GetRegistryParametersSchema)(parameters).pipe(
    Effect.mapError(
      () =>
        new IndexerFilterError({
          code: "INVALID_FILTER",
          message: "A registry address or managed name is required",
        }),
    ),
  );

  const unsupported = getV2IndexerUnsupported(config);

  if (unsupported !== null) return unsupported;

  if (decoded.address !== undefined) {
    const operationName = "V2GetRegistryByAddress";
    const address = getAddress(decoded.address);

    const response = yield* requestIndexer<
      V2GetRegistryByAddressQuery,
      V2GetRegistryByAddressQueryVariables
    >(config, {
      protocol: "v2",
      operationName,
      document: V2GetRegistryByAddressDocument,
      variables: { address: address.toLowerCase() },
    });

    const data = yield* requireIndexerData(config, "v2", operationName, response);

    if (data.registry === null) return { status: "supported", value: null };

    const indexedBlock = yield* decodeIndexedBlock(
      config,
      "v2",
      operationName,
      data["_meta"].block.number,
    );

    return {
      status: "supported",
      value: yield* normalizeV2Registry(data.registry, {
        network: config.network,
        protocol: "v2",
        indexedBlock,
        operationName,
      }),
    };
  }

  const name = yield* Effect.try({
    try: () => normalize(decoded.name),
    catch: () =>
      new IndexerFilterError({ code: "INVALID_FILTER", message: "The managed name is invalid" }),
  });

  const operationName = "V2GetRegistryByName";

  const response = yield* requestIndexer<
    V2GetRegistryByNameQuery,
    V2GetRegistryByNameQueryVariables
  >(config, {
    protocol: "v2",
    operationName,
    document: V2GetRegistryByNameDocument,
    variables: { name },
  });

  const data = yield* requireIndexerData(config, "v2", operationName, response);
  const registry = data.domain?.subregistry ?? null;

  if (registry === null) return { status: "supported", value: null };

  const indexedBlock = yield* decodeIndexedBlock(
    config,
    "v2",
    operationName,
    data["_meta"].block.number,
  );

  return {
    status: "supported",
    value: yield* normalizeV2Registry(registry, {
      network: config.network,
      protocol: "v2",
      indexedBlock,
      operationName,
    }),
  };
});

export const getRegistry = defineAction(getRegistryEffect);

export {
  GetRegistryParameters,
  GetRegistryResult,
  type GetRegistryError,
  type GetRegistryParameters as GetRegistryParametersType,
  type GetRegistryResult as GetRegistryResultType,
} from "./types.js";
