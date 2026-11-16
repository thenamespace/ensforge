import { Schema } from "effect";

import type { BlockParameters } from "../../../action/block.js";
import { EthereumAddress } from "../../../schemas/identity.js";
import { NormalizedName } from "../../../schemas/name.js";
import type { GetResolverError } from "../get-resolver/types.js";

export type GetResolverVersionParameters = { readonly name: string } & BlockParameters;

export const ResolverVersionResult = Schema.Union([
  Schema.Struct({
    supported: Schema.Literal(false),
    name: NormalizedName,
    resolver: Schema.NullOr(EthereumAddress),
    reason: Schema.Literals(["RESOLVER_NOT_FOUND", "VERSIONING_UNSUPPORTED"]),
  }),
  Schema.Struct({
    supported: Schema.Literal(true),
    name: NormalizedName,
    resolver: EthereumAddress,
    version: Schema.BigInt,
  }),
]);
export type ResolverVersionResult = typeof ResolverVersionResult.Type;

export type GetResolverVersionError = GetResolverError;
