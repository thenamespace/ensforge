import type { CallExecutionResult, WriteError } from "../../../write/types.js";

export interface AddressRecordInput {
  readonly coinType: bigint;
  readonly address: string;
}

export interface SetAddressParameters {
  readonly name: string;
  readonly coinType?: bigint;
  readonly address: string;
}

export interface SetAddressesParameters {
  readonly name: string;
  readonly addresses: ReadonlyArray<AddressRecordInput>;
}

export type SetAddressResult = CallExecutionResult;

export type SetAddressError = WriteError;

export type SetAddressesResult = CallExecutionResult;

export type SetAddressesError = WriteError;
