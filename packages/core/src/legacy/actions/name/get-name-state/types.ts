import { Schema } from "effect";

import type { BlockParameters } from "../../../action/block.js";
import type { CodecError } from "../../../errors/codec-error.js";
import type { ContractError } from "../../../errors/contract-error.js";
import type { NameError } from "../../../errors/name-error.js";
import type { RpcError } from "../../../errors/rpc-error.js";
import { EthereumAddress } from "../../../schemas/identity.js";
import { NormalizedName } from "../../../schemas/name.js";

export const NameStatus = Schema.Literals(["available", "active", "grace", "expired", "reserved"]);

export type NameStatus = typeof NameStatus.Type;

const nullableAddress = Schema.NullOr(EthereumAddress);

const nullableBigInt = Schema.NullOr(Schema.BigInt);

const sharedFields = {
  name: NormalizedName,
  status: NameStatus,
  owner: nullableAddress,
  manager: nullableAddress,
  registrant: nullableAddress,
  registry: EthereumAddress,
  resolver: nullableAddress,
  expiry: nullableBigInt,
  gracePeriodEnd: nullableBigInt,
  tokenId: nullableBigInt,
  resource: nullableBigInt,
  available: Schema.Boolean,
  renewable: Schema.Boolean,
};

export const AvailableNameState = Schema.Struct({
  ...sharedFields,
  kind: Schema.Literal("available"),
  protocol: Schema.Literals(["v1", "v2"]),
  wrapped: Schema.Literal(false),
  migrated: Schema.Literal(false),
});

export const V1UnwrappedNameState = Schema.Struct({
  ...sharedFields,
  kind: Schema.Literal("v1-unwrapped"),
  protocol: Schema.Literal("v1"),
  wrapped: Schema.Literal(false),
  migrated: Schema.Literal(false),
});

export const V1WrappedNameState = Schema.Struct({
  ...sharedFields,
  kind: Schema.Literal("v1-wrapped"),
  protocol: Schema.Literal("v1"),
  wrapped: Schema.Literal(true),
  migrated: Schema.Literal(false),
});

export const V2NativeNameState = Schema.Struct({
  ...sharedFields,
  kind: Schema.Literal("v2-native"),
  protocol: Schema.Literal("v2"),
  wrapped: Schema.Boolean,
  migrated: Schema.Literal(false),
});

export const V2MigratedNameState = Schema.Struct({
  ...sharedFields,
  kind: Schema.Literal("v2-migrated"),
  protocol: Schema.Literal("v2"),
  wrapped: Schema.Boolean,
  migrated: Schema.Literal(true),
});

export const V2ReservedNameState = Schema.Struct({
  ...sharedFields,
  kind: Schema.Literal("v2-reserved"),
  protocol: Schema.Literal("v1"),
  wrapped: Schema.Boolean,
  migrated: Schema.Literal(false),
});

export const NameState = Schema.Union([
  AvailableNameState,
  V1UnwrappedNameState,
  V1WrappedNameState,
  V2NativeNameState,
  V2MigratedNameState,
  V2ReservedNameState,
]);

export type NameState = typeof NameState.Type;

export type GetNameStateParameters = { readonly name: string } & BlockParameters;

export type GetNameStateError = CodecError | ContractError | NameError | RpcError;
