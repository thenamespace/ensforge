import { Schema } from "effect";

import { Namehash } from "../../../schemas/hash.js";
import { Hex } from "../../../schemas/hex.js";
import { EthereumAddress } from "../../../schemas/identity.js";
import { IndexedNameValue, IndexedNameV2 } from "./name.js";
import { IndexedEntitySource } from "./source.js";

const NonNegativeInt = Schema.Int.pipe(Schema.check(Schema.isGreaterThanOrEqualTo(0)));

export const IndexedRegistry = Schema.Struct({
  address: EthereumAddress,
  managedName: IndexedNameValue,
  namehash: Namehash,
  owner: Schema.NullOr(EthereumAddress),
  parentRegistry: EthereumAddress,
  createdAt: Schema.BigInt,
  createdBlock: Schema.BigInt,
  labelCount: NonNegativeInt,
  referencedByCount: NonNegativeInt,
  roleCount: NonNegativeInt,
  eventCount: NonNegativeInt,
  source: IndexedEntitySource,
});
export type IndexedRegistry = typeof IndexedRegistry.Type;

export const RegistryNameRelationship = Schema.Literals(["label", "referenced-by"]);
export type RegistryNameRelationship = typeof RegistryNameRelationship.Type;

export const IndexedRegistryName = Schema.Struct({
  relationship: RegistryNameRelationship,
  name: IndexedNameV2,
});
export type IndexedRegistryName = typeof IndexedRegistryName.Type;

export const IndexedRegistryRole = Schema.Struct({
  id: Schema.String,
  registry: EthereumAddress,
  account: EthereumAddress,
  resource: Schema.String,
  name: Schema.NullOr(Schema.String),
  bitmap: Hex,
  permissions: Schema.Array(Schema.String),
  active: Schema.Boolean,
  blockNumber: Schema.BigInt,
  timestamp: Schema.BigInt,
  transactionHash: Hex,
  source: IndexedEntitySource,
});
export type IndexedRegistryRole = typeof IndexedRegistryRole.Type;

export const RegistryRoleFilter = Schema.Struct({
  account: Schema.optional(EthereumAddress),
  resource: Schema.optional(Schema.String),
  name: Schema.optional(Schema.String),
  bitmap: Schema.optional(Hex),
  permission: Schema.optional(Schema.String),
  active: Schema.optional(Schema.Boolean),
  blockAfter: Schema.optional(Schema.BigInt),
  blockBefore: Schema.optional(Schema.BigInt),
  timestampAfter: Schema.optional(Schema.BigInt),
  timestampBefore: Schema.optional(Schema.BigInt),
});
export type RegistryRoleFilter = typeof RegistryRoleFilter.Type;
