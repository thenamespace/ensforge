import { Effect } from "effect";

import type { EnsforgeConfig } from "../../../../config/config.js";
import { requestIndexer } from "../../../../internal/indexer/client.js";
import {
  V1GetIndexedResolverDocument,
  V1GetIndexedResolverBindingDocument,
  type V1GetIndexedResolverBindingQuery,
  type V1GetIndexedResolverBindingQueryVariables,
  type V1GetIndexedResolverQuery,
  type V1GetIndexedResolverQueryVariables,
} from "../../../../internal/indexer/generated/v1/get-indexed-resolver.js";
import { normalizeV1IndexedResolver } from "../../../../internal/indexer/normalize/resolver.js";
import { decodeIndexedBlock, requireIndexerData } from "../../../../internal/indexer/response.js";
import type { Namehash } from "../../../../schemas/hash.js";
import type { EthereumAddress } from "../../../../schemas/identity.js";
import type { GetIndexedResolverError, GetIndexedResolverResult } from "./types.js";

const operationName = "V1GetIndexedResolver";

export const queryV1IndexedResolver = Effect.fn("queryV1IndexedResolver")(function* (
  config: EnsforgeConfig,
  address: EthereumAddress,
  namehash: Namehash | null,
): Effect.fn.Return<GetIndexedResolverResult, GetIndexedResolverError> {
  const data =
    namehash === null
      ? yield* Effect.gen(function* () {
          const response = yield* requestIndexer<
            V1GetIndexedResolverQuery,
            V1GetIndexedResolverQueryVariables
          >(config, {
            protocol: "v1",
            operationName,
            document: V1GetIndexedResolverDocument,
            variables: { address: address.toLowerCase(), first: 100 },
          });

          return yield* requireIndexerData(config, "v1", operationName, response);
        })
      : yield* Effect.gen(function* () {
          const response = yield* requestIndexer<
            V1GetIndexedResolverBindingQuery,
            V1GetIndexedResolverBindingQueryVariables
          >(config, {
            protocol: "v1",
            operationName,
            document: V1GetIndexedResolverBindingDocument,
            variables: { address: address.toLowerCase(), namehash: namehash.toLowerCase() },
          });

          return yield* requireIndexerData(config, "v1", operationName, response);
        });

  if (data.resolvers.length === 0) return null;

  const indexedBlock = yield* decodeIndexedBlock(
    config,
    "v1",
    operationName,
    data["_meta"].block.number,
  );

  return yield* normalizeV1IndexedResolver(address, data.resolvers, {
    network: config.network,
    protocol: "v1",
    indexedBlock,
    operationName,
  });
});
