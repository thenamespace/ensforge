import { Schema } from "effect";

import { Namehash } from "../../../../schemas/hash.js";
import { EthereumAddress } from "../../../../schemas/identity.js";
import { EnsProtocol } from "../../../../schemas/protocol.js";
import { IndexedResolver } from "../../models/resolver.js";
import type { ResolverIndexerError } from "../types.js";

const ResolverIdentity = {
  address: EthereumAddress,
  protocol: Schema.optional(EnsProtocol),
};

export const GetIndexedResolverParameters = Schema.Union([
  Schema.Struct({
    ...ResolverIdentity,
    name: Schema.optional(Schema.Never),
    namehash: Schema.optional(Schema.Never),
  }),
  Schema.Struct({
    ...ResolverIdentity,
    name: Schema.String,
    namehash: Schema.optional(Schema.Never),
  }),
  Schema.Struct({ ...ResolverIdentity, name: Schema.optional(Schema.Never), namehash: Namehash }),
]);
export type GetIndexedResolverParameters = typeof GetIndexedResolverParameters.Type;

export const GetIndexedResolverResult = Schema.NullOr(IndexedResolver);
export type GetIndexedResolverResult = typeof GetIndexedResolverResult.Type;

export type GetIndexedResolverError = ResolverIndexerError;
