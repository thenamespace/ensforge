import { Schema } from "effect";

import type { BlockParameters } from "../../../action/block.js";
import type { CodecError } from "../../../errors/codec-error.js";
import type { ContractError } from "../../../errors/contract-error.js";
import type { NameError } from "../../../errors/name-error.js";
import type { RpcError } from "../../../errors/rpc-error.js";
import { Hex } from "../../../schemas/hex.js";

export const DataResult = Schema.Struct({
  key: Schema.String,
  value: Schema.NullOr(Hex),
});

export type DataResult = typeof DataResult.Type;

export type GetDataParameters = {
  readonly name: string;
  readonly key: string;
} & BlockParameters;

export type GetDataError = CodecError | ContractError | NameError | RpcError;
