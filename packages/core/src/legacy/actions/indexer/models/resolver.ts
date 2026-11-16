import { Schema } from "effect";

import { CoinType } from "../../../schemas/coin-type.js";
import { Namehash } from "../../../schemas/hash.js";
import { Hex } from "../../../schemas/hex.js";
import { EthereumAddress } from "../../../schemas/identity.js";
import { InterfaceId } from "../../../schemas/records.js";
import { IndexedNameValue } from "./name.js";
import { IndexedEntitySource } from "./source.js";

const NonNegativeInt = Schema.Int.pipe(Schema.check(Schema.isGreaterThanOrEqualTo(0)));

export const IndexedResolverAlias = Schema.Struct({
  from: Schema.String,
  to: Schema.String,
});
export type IndexedResolverAlias = typeof IndexedResolverAlias.Type;

export const IndexedResolverNameBinding = Schema.Struct({
  id: Schema.String,
  namehash: Schema.NullOr(Namehash),
  name: IndexedNameValue,
  textKeys: Schema.Array(Schema.String),
  coinTypes: Schema.Array(CoinType),
  contentHash: Schema.NullOr(Hex),
  abiContentTypes: Schema.Array(NonNegativeInt),
  hasPubkey: Schema.Boolean,
  interfaceIds: Schema.Array(InterfaceId),
  reverseName: Schema.NullOr(Schema.String),
  version: Schema.NullOr(NonNegativeInt),
});
export type IndexedResolverNameBinding = typeof IndexedResolverNameBinding.Type;

const commonResolverFields = {
  address: EthereumAddress,
  nodeCount: Schema.NullOr(NonNegativeInt),
  bindings: Schema.Array(IndexedResolverNameBinding),
  bindingsTruncated: Schema.Boolean,
  source: IndexedEntitySource,
};

export const IndexedResolverV1 = Schema.Struct({
  ...commonResolverFields,
  protocol: Schema.Literal("v1"),
});
export type IndexedResolverV1 = typeof IndexedResolverV1.Type;

export const IndexedResolverV2 = Schema.Struct({
  ...commonResolverFields,
  protocol: Schema.Literal("v2"),
  owner: Schema.NullOr(EthereumAddress),
  aliases: Schema.Array(IndexedResolverAlias),
  roleHolderCount: NonNegativeInt,
});
export type IndexedResolverV2 = typeof IndexedResolverV2.Type;

export const IndexedResolver = Schema.Union([IndexedResolverV1, IndexedResolverV2]);
export type IndexedResolver = typeof IndexedResolver.Type;

export const IndexedOwnedResolver = Schema.Struct({
  address: EthereumAddress,
  owner: EthereumAddress,
  nodeCount: NonNegativeInt,
  aliases: Schema.Array(IndexedResolverAlias),
  roleHolderCount: NonNegativeInt,
  source: IndexedEntitySource,
});
export type IndexedOwnedResolver = typeof IndexedOwnedResolver.Type;

export const IndexedResolverMetadata = Schema.Struct({
  id: Schema.String,
  resolver: EthereumAddress,
  graphqlUrl: Schema.String,
  blockNumber: Schema.BigInt,
  timestamp: Schema.BigInt,
  transactionHash: Hex,
  source: IndexedEntitySource,
});
export type IndexedResolverMetadata = typeof IndexedResolverMetadata.Type;

export const IndexedResolverApproval = Schema.Struct({
  id: Schema.String,
  resolver: EthereumAddress,
  namehash: Namehash,
  context: Schema.NullOr(Schema.String),
  delegate: EthereumAddress,
  approved: Schema.Boolean,
  blockNumber: Schema.BigInt,
  timestamp: Schema.BigInt,
  transactionHash: Hex,
  logIndex: NonNegativeInt,
  source: IndexedEntitySource,
});
export type IndexedResolverApproval = typeof IndexedResolverApproval.Type;

export const ResolverApprovalFilter = Schema.Struct({
  resolver: Schema.optional(EthereumAddress),
  namehash: Schema.optional(Namehash),
  context: Schema.optional(Schema.String),
  delegate: Schema.optional(EthereumAddress),
  approved: Schema.optional(Schema.Boolean),
  blockAfter: Schema.optional(Schema.BigInt),
  blockBefore: Schema.optional(Schema.BigInt),
  timestampAfter: Schema.optional(Schema.BigInt),
  timestampBefore: Schema.optional(Schema.BigInt),
});
export type ResolverApprovalFilter = typeof ResolverApprovalFilter.Type;
