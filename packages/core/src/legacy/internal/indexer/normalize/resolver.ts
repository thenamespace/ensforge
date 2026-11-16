import { Effect, Schema } from "effect";

import {
  IndexedOwnedResolver,
  IndexedResolverApproval,
  IndexedResolverNameBinding,
  IndexedResolverMetadata,
  IndexedResolverV1,
  IndexedResolverV2,
  type IndexedOwnedResolver as IndexedOwnedResolverType,
  type IndexedResolverApproval as IndexedResolverApprovalType,
  type IndexedResolverNameBinding as IndexedResolverNameBindingType,
  type IndexedResolverMetadata as IndexedResolverMetadataType,
  type IndexedResolverV1 as IndexedResolverV1Type,
  type IndexedResolverV2 as IndexedResolverV2Type,
} from "../../../actions/indexer/models/resolver.js";
import { IndexerDecodeError } from "../../../errors/indexer-decode-error.js";
import { CoinType } from "../../../schemas/coin-type.js";
import type { V1GetIndexedResolverQuery } from "../generated/v1/get-indexed-resolver.js";
import type { V2GetIndexedResolverQuery } from "../generated/v2/get-indexed-resolver.js";
import type { V2GetResolverApprovalsQuery } from "../generated/v2/get-resolver-approvals.js";
import type { V2GetResolverMetadataQuery } from "../generated/v2/get-resolver-metadata.js";
import type { V2GetResolversForAddressQuery } from "../generated/v2/get-resolvers-for-address.js";
import type { IndexerNormalizationContext } from "./context.js";
import {
  decodeAddress,
  decodeDomainNamehash,
  decodeHex,
  decodeIndexedNameValue,
  decodeInteger,
} from "./scalars.js";

type V1BindingWire = V1GetIndexedResolverQuery["resolvers"][number];

type V2BindingWire = V2GetIndexedResolverQuery["bindings"][number];

type V2ResolverDetail = NonNullable<V2GetIndexedResolverQuery["detail"]>;

type V2OwnedResolverWire = V2GetResolversForAddressQuery["resolversByOwner"][number];

type V2ResolverMetadataWire = NonNullable<V2GetResolverMetadataQuery["metadata"]>;

type V2ResolverApprovalWire = V2GetResolverApprovalsQuery["approvals"][number];

const unknownName = { kind: "unknown", value: null } as const;

const binding = (wire: V1BindingWire | V2BindingWire): IndexedResolverNameBindingType => {
  const namehash =
    wire.domain === null ? null : decodeDomainNamehash(wire.domain.id, wire.domain.name);

  const v2 = "abis" in wire;

  return Schema.decodeUnknownSync(IndexedResolverNameBinding)({
    id: wire.id,
    namehash,
    name:
      wire.domain === null || namehash === null
        ? unknownName
        : decodeIndexedNameValue(wire.domain.name, namehash),
    textKeys: wire.texts ?? [],
    coinTypes: (wire.coinTypes ?? []).map((coinType) =>
      Schema.decodeUnknownSync(CoinType)(BigInt(coinType)),
    ),
    contentHash: wire.contentHash === null ? null : decodeHex(wire.contentHash),
    abiContentTypes: v2 ? (wire.abis ?? []) : [],
    hasPubkey: v2 && wire.pubkey !== null,
    interfaceIds: v2 ? (wire.interfaces ?? []).map(({ interfaceId }) => interfaceId) : [],
    reverseName: v2 ? wire.reverseName : null,
    version: v2 ? wire.version : null,
  });
};

const aliases = (wire: {
  readonly aliases: ReadonlyArray<{ readonly fromName: string; readonly toName: string }>;
}) => wire.aliases.map(({ fromName, toName }) => ({ from: fromName, to: toName }));

export const normalizeV1IndexedResolver = Effect.fn("normalizeV1IndexedResolver")(function* (
  address: string,
  wires: ReadonlyArray<V1BindingWire>,
  context: IndexerNormalizationContext,
): Effect.fn.Return<IndexedResolverV1Type, IndexerDecodeError> {
  return yield* Effect.try({
    try: () =>
      Schema.decodeUnknownSync(IndexedResolverV1)({
        protocol: "v1",
        address: decodeAddress(address),
        nodeCount: null,
        bindings: wires.map(binding),
        bindingsTruncated: wires.length >= 100,
        source: {
          network: context.network,
          protocol: context.protocol,
          indexedBlock: context.indexedBlock,
        },
      }),
    catch: (cause) =>
      new IndexerDecodeError({
        code: "INVALID_RESPONSE",
        message: `The ${context.network}:${context.protocol} indexer returned an invalid V1 resolver`,
        network: context.network,
        protocol: context.protocol,
        operationName: context.operationName,
        cause,
      }),
  });
});

export const normalizeV2IndexedResolver = Effect.fn("normalizeV2IndexedResolver")(function* (
  address: string,
  protocol: "v1" | "v2",
  detail: V2ResolverDetail | null,
  wires: ReadonlyArray<V2BindingWire>,
  context: IndexerNormalizationContext,
): Effect.fn.Return<IndexedResolverV1Type | IndexedResolverV2Type, IndexerDecodeError> {
  return yield* Effect.try({
    try: () => {
      const common = {
        address: decodeAddress(address),
        nodeCount: detail?.nodeCount ?? wires.length,
        bindings: wires.map(binding),
        bindingsTruncated: wires.length >= 100,
        source: {
          network: context.network,
          protocol: context.protocol,
          indexedBlock: context.indexedBlock,
        },
      };

      const ownerRole = detail?.roles.reduce<(typeof detail.roles)[number] | null>(
        (latest, role) =>
          role.name === null &&
          BigInt(role.resource) === 0n &&
          BigInt(role.roleBitmap) !== 0n &&
          (latest === null || role.timestamp > latest.timestamp)
            ? role
            : latest,
        null,
      );

      return protocol === "v1"
        ? Schema.decodeUnknownSync(IndexedResolverV1)({ ...common, protocol })
        : Schema.decodeUnknownSync(IndexedResolverV2)({
            ...common,
            protocol,
            owner:
              ownerRole === null || ownerRole === undefined
                ? null
                : decodeAddress(ownerRole.account),
            aliases: detail === null ? [] : aliases(detail),
            roleHolderCount: detail?.roleHolderCount ?? 0,
          });
    },
    catch: (cause) =>
      new IndexerDecodeError({
        code: "INVALID_RESPONSE",
        message: `The ${context.network}:v2 indexer returned an invalid resolver`,
        network: context.network,
        protocol: "v2",
        operationName: context.operationName,
        cause,
      }),
  });
});

export const normalizeV2OwnedResolver = Effect.fn("normalizeV2OwnedResolver")(function* (
  owner: string,
  wire: V2OwnedResolverWire,
  context: IndexerNormalizationContext,
): Effect.fn.Return<IndexedOwnedResolverType, IndexerDecodeError> {
  return yield* Effect.try({
    try: () =>
      Schema.decodeUnknownSync(IndexedOwnedResolver)({
        address: decodeAddress(wire.address),
        owner: decodeAddress(owner),
        nodeCount: decodeInteger(wire.nodeCount),
        aliases: aliases(wire),
        roleHolderCount: decodeInteger(wire.roleHolderCount),
        source: {
          network: context.network,
          protocol: "v2",
          indexedBlock: context.indexedBlock,
        },
      }),
    catch: (cause) =>
      new IndexerDecodeError({
        code: "INVALID_RESPONSE",
        message: `The ${context.network}:v2 indexer returned an invalid owned resolver`,
        network: context.network,
        protocol: "v2",
        operationName: context.operationName,
        cause,
      }),
  });
});

export const normalizeV2ResolverMetadata = Effect.fn("normalizeV2ResolverMetadata")(function* (
  wire: V2ResolverMetadataWire,
  context: IndexerNormalizationContext,
): Effect.fn.Return<IndexedResolverMetadataType, IndexerDecodeError> {
  return yield* Effect.try({
    try: () =>
      Schema.decodeUnknownSync(IndexedResolverMetadata)({
        id: wire.id,
        resolver: decodeAddress(wire.resolver),
        graphqlUrl: wire.graphqlUrl,
        blockNumber: BigInt(decodeInteger(wire.blockNumber)),
        timestamp: BigInt(decodeInteger(wire.timestamp)),
        transactionHash: decodeHex(wire.transactionHash),
        source: {
          network: context.network,
          protocol: "v2",
          indexedBlock: context.indexedBlock,
        },
      }),
    catch: (cause) =>
      new IndexerDecodeError({
        code: "INVALID_RESPONSE",
        message: `The ${context.network}:v2 indexer returned invalid resolver metadata`,
        network: context.network,
        protocol: "v2",
        operationName: context.operationName,
        cause,
      }),
  });
});

export const normalizeV2ResolverApproval = Effect.fn("normalizeV2ResolverApproval")(function* (
  wire: V2ResolverApprovalWire,
  context: IndexerNormalizationContext,
): Effect.fn.Return<IndexedResolverApprovalType, IndexerDecodeError> {
  return yield* Effect.try({
    try: () =>
      Schema.decodeUnknownSync(IndexedResolverApproval)({
        id: wire.id,
        resolver: decodeAddress(wire.resolver),
        namehash: decodeDomainNamehash(wire.namehash),
        context: wire.context,
        delegate: decodeAddress(wire.delegate),
        approved: wire.approved,
        blockNumber: BigInt(decodeInteger(wire.blockNumber)),
        timestamp: BigInt(decodeInteger(wire.timestamp)),
        transactionHash: decodeHex(wire.transactionHash),
        logIndex: decodeInteger(wire.logIndex),
        source: {
          network: context.network,
          protocol: "v2",
          indexedBlock: context.indexedBlock,
        },
      }),
    catch: (cause) =>
      new IndexerDecodeError({
        code: "INVALID_RESPONSE",
        message: `The ${context.network}:v2 indexer returned an invalid resolver approval`,
        network: context.network,
        protocol: "v2",
        operationName: context.operationName,
        cause,
      }),
  });
});
