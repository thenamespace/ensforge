import { Schema } from "effect";

import type { BlockParameters } from "../../../action/block.js";
import type { CodecError } from "../../../errors/codec-error.js";
import type { ContractError } from "../../../errors/contract-error.js";
import type { NameError } from "../../../errors/name-error.js";
import type { RpcError } from "../../../errors/rpc-error.js";
import { NormalizedName } from "../../../schemas/name.js";

export const PrimaryNameResult = Schema.NullOr(
  Schema.Struct({
    name: NormalizedName,
    match: Schema.Literal(true),
  }),
);

export type PrimaryNameResult = typeof PrimaryNameResult.Type;

export type GetPrimaryNameParameters = {
  readonly address: string;
  readonly coinType?: bigint;
} & BlockParameters;

export type GetPrimaryNameError = CodecError | ContractError | NameError | RpcError;
