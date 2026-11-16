import { Schema } from "effect";

import type { AssetGatewayUrls } from "viem";

import type { BlockParameters } from "../../../action/block.js";
import type { CodecError } from "../../../errors/codec-error.js";
import type { ContractError } from "../../../errors/contract-error.js";
import type { GatewayError } from "../../../errors/gateway-error.js";
import type { NameError } from "../../../errors/name-error.js";
import type { RpcError } from "../../../errors/rpc-error.js";

export const AvatarResult = Schema.NullOr(
  Schema.Union([
    Schema.Struct({
      status: Schema.Literal("resolved"),
      record: Schema.String,
      uri: Schema.String,
    }),
    Schema.Struct({
      status: Schema.Literal("unsupported-chain"),
      record: Schema.String,
      chainId: Schema.Int,
    }),
  ]),
);

export type AvatarResult = typeof AvatarResult.Type;

export type GetAvatarParameters = {
  readonly name: string;
  readonly gatewayUrls?: AssetGatewayUrls;
} & BlockParameters;

export type GetAvatarError = CodecError | ContractError | GatewayError | NameError | RpcError;
