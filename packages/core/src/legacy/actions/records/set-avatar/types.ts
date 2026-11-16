import type { CallExecutionResult, WriteError } from "../../../write/types.js";

export interface SetAvatarParameters {
  readonly name: string;
  readonly value: string;
}

export interface ClearAvatarParameters {
  readonly name: string;
}

export type SetAvatarResult = CallExecutionResult;

export type SetAvatarError = WriteError;

export type ClearAvatarResult = CallExecutionResult;

export type ClearAvatarError = WriteError;
