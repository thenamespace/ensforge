import { Schema } from "effect";

export const HcaErrorCode = Schema.Literals([
  "INVALID_PARAMETERS",
  "UNSUPPORTED_DEPLOYMENT",
  "DEPLOYMENT_MISMATCH",
  "ACCOUNT_UNDEPLOYED",
  "ACCOUNT_MISMATCH",
  "OWNER_MISMATCH",
  "UNSUPPORTED_AUTHORIZATION",
  "ADAPTER_MISMATCH",
  "ADAPTER_FAILED",
  "INVALID_EXECUTION",
  "DEPLOYMENT_FAILED",
  "EXECUTION_EXPIRED",
  "UNSUPPORTED_CAPABILITY",
  "SUBMISSION_UNCERTAIN",
  "INVALID_SUBMISSION",
]);
export type HcaErrorCode = typeof HcaErrorCode.Type;

export class HcaError extends Schema.TaggedError<HcaError>()("HcaError", {
  code: HcaErrorCode,
  message: Schema.String,
  cause: Schema.optional(Schema.Defect()),
}) {}
