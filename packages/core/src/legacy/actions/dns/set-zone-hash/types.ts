import type { Hex } from "../../../schemas/hex.js";
import type { CallExecutionResult, WriteError } from "../../../write/types.js";

export interface SetZoneHashParameters {
  readonly name: string;
  readonly value: Hex;
}

export type SetZoneHashResult = CallExecutionResult;

export type SetZoneHashError = WriteError;
