import type { CallExecutionResult, WriteError } from "../../write/types.js";

export interface SetPrimaryNameParameters {
  readonly name: string;
  readonly verifyForward?: boolean;
}

export interface ClearPrimaryNameParameters {}

export interface SetPrimaryNameForAddressParameters extends SetPrimaryNameParameters {
  readonly address: string;
}

export interface SetContractPrimaryNameParameters extends SetPrimaryNameParameters {
  readonly contract: string;
}

export type ReverseNameWriteResult = CallExecutionResult;

export type ReverseNameWriteError = WriteError;
