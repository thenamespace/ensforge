import { Schema } from "effect";

import type { BlockParameters } from "../../../action/block.js";
import type { CodecError } from "../../../errors/codec-error.js";
import type { ContractError } from "../../../errors/contract-error.js";
import type { GatewayError } from "../../../errors/gateway-error.js";
import type { NameError } from "../../../errors/name-error.js";
import type { RpcError } from "../../../errors/rpc-error.js";
import { Hex } from "../../../schemas/hex.js";
import { EthereumAddress } from "../../../schemas/identity.js";

export const ResolveResult = Schema.NullOr(
  Schema.Struct({
    data: Hex,
    resolverAddress: EthereumAddress,
  }),
);

export type ResolveResult = typeof ResolveResult.Type;

export const ResolveWithResolverResult = Schema.Struct({
  data: Hex,
  resolverAddress: EthereumAddress,
});

export type ResolveWithResolverResult = typeof ResolveWithResolverResult.Type;

export type ResolveParameters = {
  readonly name: string;
  readonly data: string;
} & BlockParameters;

export type ResolveWithResolverParameters = {
  readonly name: string;
  readonly data: string;
  readonly resolverAddress: string;
  readonly gateways?: ReadonlyArray<string>;
} & BlockParameters;

export type ResolveError = CodecError | ContractError | GatewayError | NameError | RpcError;

export type ResolveWithResolverError = ResolveError;
