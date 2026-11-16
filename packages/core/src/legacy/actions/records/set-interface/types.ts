import type { CallExecutionResult, WriteError } from "../../../write/types.js";

export interface SetInterfaceParameters {
  readonly name: string;
  readonly interfaceId: string;
  readonly implementer: string;
}

export type SetInterfaceResult = CallExecutionResult;

export type SetInterfaceError = WriteError;
