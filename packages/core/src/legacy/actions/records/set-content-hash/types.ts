import type { ContentHashProtocol } from "../../../schemas/records.js";
import type { CallExecutionResult, WriteError } from "../../../write/types.js";

export interface SetContentHashParameters {
  readonly name: string;
  readonly protocol: ContentHashProtocol;
  readonly value: string;
}

export type SetContentHashResult = CallExecutionResult;

export type SetContentHashError = WriteError;
