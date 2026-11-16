import { Effect } from "effect";

import type { EnsforgeConfig } from "../../../../config/config.js";
import type { IndexerProtocol } from "../../../../config/indexer-options.js";
import { requestIndexer } from "../../../../internal/indexer/client.js";
import {
  V1GetIndexedNameDocument,
  type V1GetIndexedNameQuery,
  type V1GetIndexedNameQueryVariables,
} from "../../../../internal/indexer/generated/v1/get-indexed-name.js";
import {
  V2GetIndexedNameDocument,
  type V2GetIndexedNameQuery,
  type V2GetIndexedNameQueryVariables,
} from "../../../../internal/indexer/generated/v2/get-indexed-name.js";
import {
  normalizeV1IndexedName,
  normalizeV2IndexerName,
} from "../../../../internal/indexer/normalize/index.js";
import { decodeIndexedBlock, requireIndexerData } from "../../../../internal/indexer/response.js";
import type { Namehash } from "../../../../schemas/hash.js";
import type { IndexedName } from "../../models/name.js";
import type { GetIndexedNameError } from "./types.js";

interface IndexedNameLookup {
  readonly name: string | null;
  readonly namehash: Namehash;
}

const operationName = (protocol: IndexerProtocol) =>
  protocol === "v1" ? "V1GetIndexedName" : "V2GetIndexedName";

export const queryIndexedNameSource = Effect.fn("queryIndexedNameSource")(function* (
  config: EnsforgeConfig,
  protocol: IndexerProtocol,
  lookup: IndexedNameLookup,
): Effect.fn.Return<IndexedName | null, GetIndexedNameError> {
  const operation = operationName(protocol);

  if (protocol === "v1") {
    const response = yield* requestIndexer<V1GetIndexedNameQuery, V1GetIndexedNameQueryVariables>(
      config,
      {
        protocol,
        operationName: operation,
        document: V1GetIndexedNameDocument,
        variables: { id: lookup.namehash },
      },
    );

    const result = yield* requireIndexerData(config, protocol, operation, response);

    if (result.domain === null) return null;

    const indexedBlock = yield* decodeIndexedBlock(
      config,
      protocol,
      operation,
      result["_meta"].block.number,
    );

    return yield* normalizeV1IndexedName(result.domain, {
      network: config.network,
      protocol,
      indexedBlock,
      operationName: operation,
    });
  }

  const response = yield* requestIndexer<V2GetIndexedNameQuery, V2GetIndexedNameQueryVariables>(
    config,
    {
      protocol,
      operationName: operation,
      document: V2GetIndexedNameDocument,
      variables: {
        name: lookup.name ?? lookup.namehash,
        namehash: lookup.namehash,
      },
    },
  );

  const result = yield* requireIndexerData(config, protocol, operation, response);
  const domain = result.byName ?? result.byNamehash;

  if (domain === null) return null;

  const indexedBlock = yield* decodeIndexedBlock(
    config,
    protocol,
    operation,
    result["_meta"].block.number,
  );

  return yield* normalizeV2IndexerName(domain, {
    network: config.network,
    protocol,
    indexedBlock,
    operationName: operation,
  });
});
