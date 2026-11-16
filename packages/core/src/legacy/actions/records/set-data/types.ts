import type { Hex } from "../../../schemas/hex.js";
import type { CallExecutionResult, WriteError } from "../../../write/types.js";

export interface SetDataParameters {
  readonly name: string;
  readonly key: string;
  readonly value: Hex;
}

export type SetDataResult = CallExecutionResult;

export type SetDataError = WriteError;
