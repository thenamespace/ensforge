import { Schema } from "effect";

import type { BlockParameters } from "../../../action/block.js";
import type { CodecError } from "../../../errors/codec-error.js";
import type { ContractError } from "../../../errors/contract-error.js";
import type { NameError } from "../../../errors/name-error.js";
import type { RpcError } from "../../../errors/rpc-error.js";

export const NameResult = Schema.Struct({
  name: Schema.NullOr(Schema.String),
});

export type NameResult = typeof NameResult.Type;

export type GetNameParameters = {
  readonly name: string;
} & BlockParameters;

export type GetNameError = CodecError | ContractError | NameError | RpcError;
