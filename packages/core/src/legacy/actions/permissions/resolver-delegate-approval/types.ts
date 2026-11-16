import type { EnsWriteIntent } from "../../../action/write-intent.js";
import type { CallExecutionResult, WriteError } from "../../../write/types.js";

export interface SetResolverDelegateApprovalParameters {
  readonly name: string;
  readonly delegate: string;
  readonly approved: boolean;
}

export type SetResolverDelegateApprovalResult = CallExecutionResult;

export type SetResolverDelegateApprovalError = WriteError;

export type SetResolverDelegateApprovalIntent = EnsWriteIntent<
  SetResolverDelegateApprovalResult,
  SetResolverDelegateApprovalError
>;
