import { Schema } from "effect";

import { Namehash } from "../../../schemas/hash.js";
import { Hex } from "../../../schemas/hex.js";
import { EthereumAddress } from "../../../schemas/identity.js";
import { IndexedEntitySource } from "./source.js";

const NonNegativeBigInt = Schema.BigInt.pipe(Schema.check(Schema.isGreaterThanOrEqualToBigInt(0n)));

export const IndexedRecordKind = Schema.Literals([
  "address",
  "text",
  "contenthash",
  "abi",
  "pubkey",
  "interface",
  "reverse-name",
  "authorization",
  "version",
  "unknown",
]);
export type IndexedRecordKind = typeof IndexedRecordKind.Type;

export const IndexedRecordInventory = Schema.Struct({
  textKeys: Schema.Array(Schema.String),
  coinTypes: Schema.Array(NonNegativeBigInt),
  hasContenthash: Schema.Boolean,
  abiContentTypes: Schema.Array(NonNegativeBigInt),
  hasPubkey: Schema.Boolean,
  interfaceIds: Schema.Array(Hex),
  hasReverseName: Schema.Boolean,
  hasAuthorizations: Schema.Boolean,
});
export type IndexedRecordInventory = typeof IndexedRecordInventory.Type;

export const IndexedResolverBinding = Schema.Struct({
  source: IndexedEntitySource,
  resolver: EthereumAddress,
  current: Schema.Boolean,
  version: Schema.NullOr(NonNegativeBigInt),
  records: IndexedRecordInventory,
});
export type IndexedResolverBinding = typeof IndexedResolverBinding.Type;

const eventFields = {
  id: Schema.String,
  namehash: Namehash,
  source: IndexedEntitySource,
  resolver: EthereumAddress,
  blockNumber: NonNegativeBigInt,
  timestamp: Schema.NullOr(NonNegativeBigInt),
  transactionHash: Schema.NullOr(Hex),
  logIndex: Schema.NullOr(NonNegativeBigInt),
  raw: Schema.Struct({ type: Schema.String, data: Schema.NullOr(Schema.String) }),
};

export const IndexedRecordEvent = Schema.Union([
  Schema.Struct({
    ...eventFields,
    kind: Schema.Literal("address"),
    coinType: NonNegativeBigInt,
    value: Hex,
  }),
  Schema.Struct({
    ...eventFields,
    kind: Schema.Literal("text"),
    key: Schema.String,
    value: Schema.NullOr(Schema.String),
  }),
  Schema.Struct({
    ...eventFields,
    kind: Schema.Literal("contenthash"),
    value: Hex,
  }),
  Schema.Struct({
    ...eventFields,
    kind: Schema.Literal("abi"),
    contentType: NonNegativeBigInt,
  }),
  Schema.Struct({
    ...eventFields,
    kind: Schema.Literal("pubkey"),
    x: Hex,
    y: Hex,
  }),
  Schema.Struct({
    ...eventFields,
    kind: Schema.Literal("interface"),
    interfaceId: Hex,
    implementer: EthereumAddress,
  }),
  Schema.Struct({
    ...eventFields,
    kind: Schema.Literal("reverse-name"),
    name: Schema.String,
  }),
  Schema.Struct({
    ...eventFields,
    kind: Schema.Literal("authorization"),
    owner: EthereumAddress,
    target: EthereumAddress,
    authorized: Schema.Boolean,
  }),
  Schema.Struct({
    ...eventFields,
    kind: Schema.Literal("version"),
    version: NonNegativeBigInt,
  }),
  Schema.Struct({
    ...eventFields,
    kind: Schema.Literal("unknown"),
    eventType: Schema.String,
  }),
]);
export type IndexedRecordEvent = typeof IndexedRecordEvent.Type;

export const RecordHistoryFilter = Schema.Struct({
  kinds: Schema.optional(Schema.Array(IndexedRecordKind)),
  textKey: Schema.optional(Schema.String),
  coinType: Schema.optional(NonNegativeBigInt),
  resolver: Schema.optional(EthereumAddress),
  blockAfter: Schema.optional(NonNegativeBigInt),
  blockBefore: Schema.optional(NonNegativeBigInt),
  timestampAfter: Schema.optional(NonNegativeBigInt),
  timestampBefore: Schema.optional(NonNegativeBigInt),
});
export type RecordHistoryFilter = typeof RecordHistoryFilter.Type;

export const RecordHistoryOrder = Schema.Struct({
  direction: Schema.Literals(["asc", "desc"]),
});
export type RecordHistoryOrder = typeof RecordHistoryOrder.Type;

export const defaultRecordHistoryOrder = Object.freeze({
  direction: "desc",
}) satisfies RecordHistoryOrder;
