import type { CallExecutionResult, WriteError } from "../../../write/types.js";

export interface SetTextParameters {
  readonly name: string;
  readonly key: string;
  readonly value: string;
}

export type SetTextResult = CallExecutionResult;

export type SetTextError = WriteError;
