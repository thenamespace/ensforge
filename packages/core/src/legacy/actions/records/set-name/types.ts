import type { CallExecutionResult, WriteError } from "../../../write/types.js";

export interface SetNameParameters {
  readonly name: string;
  readonly value: string;
}

export type SetNameResult = CallExecutionResult;

export type SetNameError = WriteError;
