import type { CallExecutionResult, WriteError } from "../../../write/types.js";

export interface ClearRecordsParameters {
  readonly name: string;
}

export type ClearRecordsResult = CallExecutionResult;

export type ClearRecordsError = WriteError;
