import type { CallExecutionResult, WriteError } from "../../../write/types.js";

export interface TextRecordInput {
  readonly key: string;
  readonly value: string;
}

export interface SetTextsParameters {
  readonly name: string;
  readonly texts: ReadonlyArray<TextRecordInput>;
}

export type SetTextsResult = CallExecutionResult;

export type SetTextsError = WriteError;
