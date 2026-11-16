import { Schema } from "effect";

import type { BlockParameters } from "../../../action/block.js";
import type { CodecError } from "../../../errors/codec-error.js";
import type { ContractError } from "../../../errors/contract-error.js";
import type { NameError } from "../../../errors/name-error.js";
import type { RpcError } from "../../../errors/rpc-error.js";

export const TextResult = Schema.Struct({
  key: Schema.String,
  value: Schema.NullOr(Schema.String),
});

export type TextResult = typeof TextResult.Type;

export type GetTextParameters = {
  readonly name: string;
  readonly key: string;
} & BlockParameters;

export type GetTextsParameters = {
  readonly name: string;
  readonly keys: ReadonlyArray<string>;
} & BlockParameters;

export type GetTextError = CodecError | ContractError | NameError | RpcError;

export type GetTextsError = GetTextError;
