import type { Hex } from "../../../schemas/hex.js";
import type { CallExecutionResult, WriteError } from "../../../write/types.js";

export interface SetDnsRecordsParameters {
  readonly name: string;
  readonly data: Hex;
}

export type SetDnsRecordsResult = CallExecutionResult;

export type SetDnsRecordsError = WriteError;
