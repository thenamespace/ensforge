import type { CallExecutionResult, WriteError } from "../../../write/types.js";

export interface SetResolverParameters {
  readonly name: string;
  readonly resolver: string;
}

export type SetResolverResult = CallExecutionResult;

export type SetResolverError = WriteError;
