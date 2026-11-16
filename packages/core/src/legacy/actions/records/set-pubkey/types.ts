import type { Hex } from "../../../schemas/hex.js";
import type { CallExecutionResult, WriteError } from "../../../write/types.js";

export interface SetPubkeyParameters {
  readonly name: string;
  readonly x: Hex;
  readonly y: Hex;
}

export type SetPubkeyResult = CallExecutionResult;

export type SetPubkeyError = WriteError;
