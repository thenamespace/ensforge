import { Schema } from "effect";

import { Namehash } from "../../../schemas/hash.js";
import { Hex } from "../../../schemas/hex.js";
import { EthereumAddress } from "../../../schemas/identity.js";
import { IndexedRecordKind } from "./record.js";
import { IndexedEntitySource } from "./source.js";

const NonNegativeBigInt = Schema.BigInt.pipe(Schema.check(Schema.isGreaterThanOrEqualToBigInt(0n)));

const NullableAddress = Schema.NullOr(EthereumAddress);

const NullableBigInt = Schema.NullOr(NonNegativeBigInt);

const eventFields = {
  id: Schema.String,
  protocol: Schema.Literals(["v1", "v2"]),
  name: Schema.NullOr(Schema.String),
  namehash: Schema.NullOr(Namehash),
  blockNumber: NonNegativeBigInt,
  timestamp: NullableBigInt,
  transactionHash: Schema.NullOr(Hex),
  logIndex: NullableBigInt,
  contractAddress: NullableAddress,
  source: IndexedEntitySource,
  raw: Schema.Struct({ type: Schema.String, data: Schema.NullOr(Schema.String) }),
};

export const IndexedEventKind = Schema.Literals([
  "registration",
  "renewal",
  "transfer",
  "resolver",
  "ttl",
  "wrap",
  "unwrap",
  "fuses",
  "expiry",
  "record",
  "migration",
  "subregistry",
  "role",
  "reverse",
  "unknown",
]);
export type IndexedEventKind = typeof IndexedEventKind.Type;

export const IndexedEvent = Schema.Union([
  Schema.Struct({
    ...eventFields,
    kind: Schema.Literal("registration"),
    registrationKind: Schema.Literals(["name", "label"]),
    registrant: NullableAddress,
    expiry: NullableBigInt,
    cost: NullableBigInt,
    baseCost: NullableBigInt,
    premium: NullableBigInt,
    referrer: Schema.NullOr(Hex),
  }),
  Schema.Struct({ ...eventFields, kind: Schema.Literal("renewal"), expiry: NullableBigInt }),
  Schema.Struct({
    ...eventFields,
    kind: Schema.Literal("transfer"),
    from: NullableAddress,
    to: NullableAddress,
    tokenId: NullableBigInt,
  }),
  Schema.Struct({ ...eventFields, kind: Schema.Literal("resolver"), resolver: NullableAddress }),
  Schema.Struct({ ...eventFields, kind: Schema.Literal("ttl"), ttl: NonNegativeBigInt }),
  Schema.Struct({
    ...eventFields,
    kind: Schema.Literal("wrap"),
    owner: NullableAddress,
    fuses: NullableBigInt,
    expiry: NullableBigInt,
  }),
  Schema.Struct({ ...eventFields, kind: Schema.Literal("unwrap"), owner: NullableAddress }),
  Schema.Struct({ ...eventFields, kind: Schema.Literal("fuses"), fuses: NonNegativeBigInt }),
  Schema.Struct({ ...eventFields, kind: Schema.Literal("expiry"), expiry: NonNegativeBigInt }),
  Schema.Struct({
    ...eventFields,
    kind: Schema.Literal("record"),
    recordKind: IndexedRecordKind,
    key: Schema.NullOr(Schema.String),
    coinType: NullableBigInt,
  }),
  Schema.Struct({ ...eventFields, kind: Schema.Literal("migration"), owner: NullableAddress }),
  Schema.Struct({
    ...eventFields,
    kind: Schema.Literal("subregistry"),
    registry: NullableAddress,
    subregistry: NullableAddress,
  }),
  Schema.Struct({
    ...eventFields,
    kind: Schema.Literal("role"),
    account: NullableAddress,
    resource: Schema.NullOr(Hex),
    roles: NullableBigInt,
    active: Schema.Boolean,
  }),
  Schema.Struct({ ...eventFields, kind: Schema.Literal("reverse"), address: NullableAddress }),
  Schema.Struct({ ...eventFields, kind: Schema.Literal("unknown"), eventType: Schema.String }),
]);
export type IndexedEvent = typeof IndexedEvent.Type;

export const EventFilter = Schema.Struct({
  name: Schema.optional(Schema.String),
  namehash: Schema.optional(Namehash),
  protocols: Schema.optional(Schema.Array(Schema.Literals(["v1", "v2"]))),
  kinds: Schema.optional(Schema.Array(IndexedEventKind)),
  contractAddress: Schema.optional(EthereumAddress),
  blockAfter: Schema.optional(NonNegativeBigInt),
  blockBefore: Schema.optional(NonNegativeBigInt),
  timestampAfter: Schema.optional(NonNegativeBigInt),
  timestampBefore: Schema.optional(NonNegativeBigInt),
});
export type EventFilter = typeof EventFilter.Type;

export const EventOrder = Schema.Struct({ direction: Schema.Literals(["asc", "desc"]) });
export type EventOrder = typeof EventOrder.Type;

export const defaultEventOrder = Object.freeze({ direction: "desc" }) satisfies EventOrder;
