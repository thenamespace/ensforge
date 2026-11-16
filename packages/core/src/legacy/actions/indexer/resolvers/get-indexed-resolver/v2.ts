import { Effect } from "effect";

import type { EnsforgeConfig } from "../../../../config/config.js";
import { requestIndexer } from "../../../../internal/indexer/client.js";
import {
  V2GetIndexedResolverDocument,
  V2GetIndexedResolverBindingDocument,
  type V2GetIndexedResolverBindingQuery,
  type V2GetIndexedResolverBindingQueryVariables,
  type V2GetIndexedResolverQuery,
  type V2GetIndexedResolverQueryVariables,
} from "../../../../internal/indexer/generated/v2/get-indexed-resolver.js";
import { normalizeV2IndexedResolver } from "../../../../internal/indexer/normalize/resolver.js";
import { decodeIndexedBlock, requireIndexerData } from "../../../../internal/indexer/response.js";
import type { Namehash } from "../../../../schemas/hash.js";
import type { EthereumAddress } from "../../../../schemas/identity.js";
import type { EnsProtocol } from "../../../../schemas/protocol.js";
import type { GetIndexedResolverError, GetIndexedResolverResult } from "./types.js";

const operationName = "V2GetIndexedResolver";

const bindingProtocol = (id: string): EnsProtocol =>
  id.startsWith("v2-") || id.includes("-v2-") ? "v2" : "v1";

export const queryV2IndexedResolver = Effect.fn("queryV2IndexedResolver")(function* (
  config: EnsforgeConfig,
  address: EthereumAddress,
  requestedProtocol: EnsProtocol | undefined,
  namehash: Namehash | null,
): Effect.fn.Return<GetIndexedResolverResult, GetIndexedResolverError> {
  const variables = {
    address: address.toLowerCase(),
    protocol: requestedProtocol ?? null,
  };

  const data =
    namehash === null
      ? yield* Effect.gen(function* () {
          const response = yield* requestIndexer<
            V2GetIndexedResolverQuery,
            V2GetIndexedResolverQueryVariables
          >(config, {
            protocol: "v2",
            operationName,
            document: V2GetIndexedResolverDocument,
            variables: { ...variables, first: 100 },
          });

          return yield* requireIndexerData(config, "v2", operationName, response);
        })
      : yield* Effect.gen(function* () {
          const response = yield* requestIndexer<
            V2GetIndexedResolverBindingQuery,
            V2GetIndexedResolverBindingQueryVariables
          >(config, {
            protocol: "v2",
            operationName,
            document: V2GetIndexedResolverBindingDocument,
            variables: { ...variables, namehash: namehash.toLowerCase() },
          });

          return yield* requireIndexerData(config, "v2", operationName, response);
        });

  if (data.detail === null && data.bindings.length === 0) return null;

  const protocol =
    requestedProtocol ??
    (data.bindings.some(({ id }) => bindingProtocol(id) === "v2") ? "v2" : "v1");

  const bindings = data.bindings.filter(({ id }) => bindingProtocol(id) === protocol);

  if (bindings.length === 0 && (protocol === "v1" || data.detail === null)) return null;

  const indexedBlock = yield* decodeIndexedBlock(
    config,
    "v2",
    operationName,
    data["_meta"].block.number,
  );

  return yield* normalizeV2IndexedResolver(address, protocol, data.detail, bindings, {
    network: config.network,
    protocol: "v2",
    indexedBlock,
    operationName,
  });
});
