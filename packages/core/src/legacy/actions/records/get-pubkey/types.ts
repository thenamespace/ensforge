import { Schema } from "effect";

import type { BlockParameters } from "../../../action/block.js";
import type { CodecError } from "../../../errors/codec-error.js";
import type { ContractError } from "../../../errors/contract-error.js";
import type { NameError } from "../../../errors/name-error.js";
import type { RpcError } from "../../../errors/rpc-error.js";
import { Hex } from "../../../schemas/hex.js";

export const PubkeyResult = Schema.NullOr(
  Schema.Struct({
    x: Hex,
    y: Hex,
  }),
);

export type PubkeyResult = typeof PubkeyResult.Type;

export type GetPubkeyParameters = {
  readonly name: string;
} & BlockParameters;

export type GetPubkeyError = CodecError | ContractError | NameError | RpcError;
