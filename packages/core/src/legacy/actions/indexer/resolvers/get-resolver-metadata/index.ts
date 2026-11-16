import { Effect, Schema } from "effect";

import { getAddress } from "viem";

import { defineAction } from "../../../../action/action.js";
import type { EnsforgeConfig } from "../../../../config/config.js";
import { IndexerConfigError } from "../../../../errors/indexer-config-error.js";
import { IndexerFilterError } from "../../../../errors/indexer-filter-error.js";
import { requestIndexer } from "../../../../internal/indexer/client.js";
import {
  V2GetResolverMetadataDocument,
  type V2GetResolverMetadataQuery,
  type V2GetResolverMetadataQueryVariables,
} from "../../../../internal/indexer/generated/v2/get-resolver-metadata.js";
import { normalizeV2ResolverMetadata } from "../../../../internal/indexer/normalize/resolver.js";
import { decodeIndexedBlock, requireIndexerData } from "../../../../internal/indexer/response.js";
import { getV2IndexerUnsupported } from "../../../../internal/indexer/v2-support.js";
import {
  GetResolverMetadataParameters as GetResolverMetadataParametersSchema,
  type GetResolverMetadataError,
  type GetResolverMetadataParameters,
  type GetResolverMetadataResult,
} from "./types.js";

const getResolverMetadataEffect = Effect.fn("ensforge.getResolverMetadata")(function* (
  config: EnsforgeConfig,
  parameters: GetResolverMetadataParameters,
): Effect.fn.Return<GetResolverMetadataResult, GetResolverMetadataError> {
  if (!config.indexer.enabled) {
    return yield* new IndexerConfigError({
      code: "INDEXER_DISABLED",
      message: "Indexer actions are disabled for this configuration",
    });
  }

  const decoded = yield* Schema.decodeUnknownEffect(GetResolverMetadataParametersSchema)(
    parameters,
  ).pipe(
    Effect.mapError(
      () =>
        new IndexerFilterError({
          code: "INVALID_FILTER",
          message: "The resolver metadata query parameters are invalid",
        }),
    ),
  );

  const unsupported = getV2IndexerUnsupported(config);

  if (unsupported !== null) return unsupported;

  const resolver = getAddress(decoded.resolver);
  const operationName = "V2GetResolverMetadata";

  const response = yield* requestIndexer<
    V2GetResolverMetadataQuery,
    V2GetResolverMetadataQueryVariables
  >(config, {
    protocol: "v2",
    operationName,
    document: V2GetResolverMetadataDocument,
    variables: { resolver: resolver.toLowerCase() },
  });

  const data = yield* requireIndexerData(config, "v2", operationName, response);

  if (data.metadata === null) return { status: "supported", value: null };

  const indexedBlock = yield* decodeIndexedBlock(
    config,
    "v2",
    operationName,
    data["_meta"].block.number,
  );

  return {
    status: "supported",
    value: yield* normalizeV2ResolverMetadata(data.metadata, {
      network: config.network,
      protocol: "v2",
      indexedBlock,
      operationName,
    }),
  };
});

export const getResolverMetadata = defineAction(getResolverMetadataEffect);

export {
  GetResolverMetadataParameters,
  GetResolverMetadataResult,
  type GetResolverMetadataError,
  type GetResolverMetadataParameters as GetResolverMetadataParametersType,
  type GetResolverMetadataResult as GetResolverMetadataResultType,
} from "./types.js";
