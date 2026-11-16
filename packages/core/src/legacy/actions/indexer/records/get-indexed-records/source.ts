import { Array as Arr, Effect, Order, Result, Schema } from "effect";

import type { EnsforgeConfig } from "../../../../config/config.js";
import {
  getIndexerRuntimeConfig,
  type IndexerProtocol,
} from "../../../../config/indexer-options.js";
import { IndexerDecodeError } from "../../../../errors/indexer-decode-error.js";
import { requestIndexer } from "../../../../internal/indexer/client.js";
import {
  V1GetIndexedRecordsDocument,
  type V1GetIndexedRecordsQuery,
  type V1GetIndexedRecordsQueryVariables,
} from "../../../../internal/indexer/generated/v1/get-indexed-records.js";
import {
  V2GetIndexedRecordsDocument,
  type V2GetIndexedRecordsQuery,
  type V2GetIndexedRecordsQueryVariables,
} from "../../../../internal/indexer/generated/v2/get-indexed-records.js";
import {
  decodeAddress,
  decodeBigInt,
  decodeHex,
} from "../../../../internal/indexer/normalize/scalars.js";
import type { IndexerSourcePageResult } from "../../../../internal/indexer/pagination/merge.js";
import {
  decodeIndexedBlock,
  indexerSourceFailure,
  requireIndexerData,
} from "../../../../internal/indexer/response.js";
import type { Namehash } from "../../../../schemas/hash.js";
import { Hex } from "../../../../schemas/hex.js";
import type { IndexedResolverBinding } from "../../models/record.js";
import type { GetIndexedRecordsError } from "./types.js";

interface RecordsLookup {
  readonly name: string | null;
  readonly namehash: Namehash;
}

interface IndexedRecordsSourceResult {
  readonly indexedBlock: bigint;
  readonly bindings: ReadonlyArray<IndexedResolverBinding>;
}

const zeroHex = (value: string) => /^0x0*$/u.test(value);

const queryV1 = Effect.fn("queryV1IndexedRecords")(function* (
  config: EnsforgeConfig,
  lookup: RecordsLookup,
): Effect.fn.Return<IndexedRecordsSourceResult, GetIndexedRecordsError> {
  const operationName = "V1GetIndexedRecords";

  const response = yield* requestIndexer<
    V1GetIndexedRecordsQuery,
    V1GetIndexedRecordsQueryVariables
  >(config, {
    protocol: "v1",
    operationName,
    document: V1GetIndexedRecordsDocument,
    variables: { id: lookup.namehash, domainId: lookup.namehash, first: 100 },
  });

  const data = yield* requireIndexerData(config, "v1", operationName, response);

  const indexedBlock = yield* decodeIndexedBlock(
    config,
    "v1",
    operationName,
    data["_meta"]?.block.number,
  );

  const bindings = yield* Effect.try({
    try: () =>
      data.resolvers.map((resolver) => {
        const abiContentTypes = new Set<bigint>();
        const interfaces = new Map<typeof Hex.Type, boolean>();
        let hasPubkey = false;
        let sawPubkey = false;
        let hasReverseName = false;
        let sawReverseName = false;
        const authorizations = new Map<string, boolean>();
        let version: bigint | null = null;

        for (const event of resolver.events) {
          if (event["__typename"] === "AbiChanged")
            abiContentTypes.add(decodeBigInt(event.contentType));

          if (event["__typename"] === "InterfaceChanged") {
            const interfaceId = decodeHex(event.interfaceID);

            if (!interfaces.has(interfaceId)) {
              interfaces.set(interfaceId, !zeroHex(event.implementer));
            }
          }

          if (event["__typename"] === "PubkeyChanged" && !sawPubkey) {
            hasPubkey = !zeroHex(event.x) || !zeroHex(event.y);
            sawPubkey = true;
          }

          if (event["__typename"] === "NameChanged" && !sawReverseName) {
            hasReverseName = event.name.length > 0;
            sawReverseName = true;
          }

          if (event["__typename"] === "AuthorisationChanged") {
            const key = `${event.owner.toLowerCase()}:${event.target.toLowerCase()}`;

            if (!authorizations.has(key)) authorizations.set(key, event.isAuthorized);
          }

          if (event["__typename"] === "VersionChanged" && version === null)
            version = decodeBigInt(event.version);
        }

        return {
          source: { network: config.network, protocol: "v1" as const, indexedBlock },
          resolver: decodeAddress(resolver.address),
          current: resolver.id === data.domain?.resolver?.id,
          version,
          records: {
            textKeys: Arr.sort(resolver.texts ?? [], Order.String),
            coinTypes: Arr.sort(
              new Set((resolver.coinTypes ?? []).map(decodeBigInt)),
              Order.BigInt,
            ),
            hasContenthash: resolver.contentHash !== null && !zeroHex(resolver.contentHash),
            abiContentTypes: Arr.sort(abiContentTypes, Order.BigInt),
            hasPubkey,
            interfaceIds: Arr.sort(
              [...interfaces].flatMap(([interfaceId, active]) => (active ? [interfaceId] : [])),
              Order.String,
            ),
            hasReverseName,
            hasAuthorizations: [...authorizations.values()].some(Boolean),
          },
        };
      }),
    catch: (cause) =>
      new IndexerDecodeError({
        code: "INVALID_RESPONSE",
        message: "Unable to decode the V1 indexed record inventory",
        network: config.network,
        protocol: "v1",
        operationName,
        cause,
      }),
  });

  return { indexedBlock, bindings };
});

const queryV2 = Effect.fn("queryV2IndexedRecords")(function* (
  config: EnsforgeConfig,
  lookup: RecordsLookup,
): Effect.fn.Return<IndexedRecordsSourceResult, GetIndexedRecordsError> {
  const operationName = "V2GetIndexedRecords";

  const response = yield* requestIndexer<
    V2GetIndexedRecordsQuery,
    V2GetIndexedRecordsQueryVariables
  >(config, {
    protocol: "v2",
    operationName,
    document: V2GetIndexedRecordsDocument,
    variables: {
      name: lookup.name ?? lookup.namehash,
      namehash: lookup.namehash,
      first: 100,
      protocol: getIndexerRuntimeConfig(config.indexer).sourceStates.v1 === "enabled" ? "v2" : null,
    },
  });

  const data = yield* requireIndexerData(config, "v2", operationName, response);

  const indexedBlock = yield* decodeIndexedBlock(
    config,
    "v2",
    operationName,
    data["_meta"].block.number,
  );

  const currentResolver = (data.byName ?? data.byNamehash)?.resolver?.id;

  const bindings = yield* Effect.try({
    try: () =>
      data.resolvers.map((resolver) => ({
        source: { network: config.network, protocol: "v2" as const, indexedBlock },
        resolver: decodeAddress(resolver.address),
        current: resolver.id === currentResolver,
        version: resolver.version === null ? null : BigInt(resolver.version),
        records: {
          textKeys: Arr.sort(resolver.texts ?? [], Order.String),
          coinTypes: Arr.sort(new Set((resolver.coinTypes ?? []).map(decodeBigInt)), Order.BigInt),
          hasContenthash: resolver.contentHash !== null && !zeroHex(resolver.contentHash),
          abiContentTypes: Arr.sort(new Set((resolver.abis ?? []).map(BigInt)), Order.BigInt),
          hasPubkey:
            resolver.pubkey !== null &&
            (!zeroHex(resolver.pubkey.x) || !zeroHex(resolver.pubkey.y)),
          interfaceIds: Arr.sort(
            new Set(
              (resolver.interfaces ?? []).map(({ interfaceId }) =>
                Schema.decodeUnknownSync(Hex)(interfaceId),
              ),
            ),
            Order.String,
          ),
          hasReverseName: (resolver.reverseName?.length ?? 0) > 0,
          hasAuthorizations: false,
        },
      })),
    catch: (cause) =>
      new IndexerDecodeError({
        code: "INVALID_RESPONSE",
        message: "Unable to decode the V2 indexed record inventory",
        network: config.network,
        protocol: "v2",
        operationName,
        cause,
      }),
  });

  return { indexedBlock, bindings };
});

export const queryIndexedRecordsSource = Effect.fn("queryIndexedRecordsSource")(function* (
  config: EnsforgeConfig,
  protocol: IndexerProtocol,
  lookup: RecordsLookup,
): Effect.fn.Return<
  IndexerSourcePageResult<IndexedResolverBinding, GetIndexedRecordsError>,
  never
> {
  const result = yield* Effect.result(
    protocol === "v1" ? queryV1(config, lookup) : queryV2(config, lookup),
  );

  if (Result.isFailure(result)) {
    return {
      status: "failed",
      error: result.failure,
      metadata: {
        protocol,
        status: "failed",
        failure: indexerSourceFailure(result.failure),
      },
    };
  }

  return {
    status: "complete",
    page: {
      protocol,
      candidates: result.success.bindings.map((item) => ({ item, position: "" })),
      hasNextPage: false,
    },
    metadata: {
      protocol,
      status: "complete",
      indexedBlock: result.success.indexedBlock,
      hasNextPage: false,
    },
  };
});
