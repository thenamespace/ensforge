import type { EnsWriteIntent } from "../../../action/write-intent.js";
import type { CallExecutionResult, WriteError } from "../../../write/types.js";

export interface ApproveNameParameters {
  readonly name: string;
  readonly approved: string;
}

export interface ClearNameApprovalParameters {
  readonly name: string;
}

export type ApproveNameResult = CallExecutionResult;

export type ApproveNameError = WriteError;

export type ApproveNameIntent = EnsWriteIntent<ApproveNameResult, ApproveNameError>;

export type ClearNameApprovalResult = CallExecutionResult;

export type ClearNameApprovalError = WriteError;

export type ClearNameApprovalIntent = EnsWriteIntent<
  ClearNameApprovalResult,
  ClearNameApprovalError
>;
