import type { EnsWriteIntent } from "../../../action/write-intent.js";
import type { CallExecutionResult, WriteError } from "../../../write/types.js";

export type OperatorApprovalKind = "registry" | "registrar" | "wrapper" | "resolver";

export interface SetOperatorApprovalParameters {
  readonly name: string;
  readonly target: OperatorApprovalKind;
  readonly operator: string;
  readonly approved: boolean;
}

export type SetOperatorApprovalResult = CallExecutionResult;

export type SetOperatorApprovalError = WriteError;

export type SetOperatorApprovalIntent = EnsWriteIntent<
  SetOperatorApprovalResult,
  SetOperatorApprovalError
>;
