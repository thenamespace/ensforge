import { Schema } from "effect";

export const WritePlanErrorCode = Schema.Literals([
  "INVALID_CALL_PLAN",
  "INTENT_NOT_PREPARABLE",
  "DEPENDENCY_FAILED",
  "INCOMPATIBLE_ACCOUNTS",
  "INCOMPATIBLE_CHAINS",
]);
export type WritePlanErrorCode = typeof WritePlanErrorCode.Type;

export class WritePlanError extends Schema.TaggedError<WritePlanError>()("WritePlanError", {
  code: WritePlanErrorCode,
  message: Schema.String,
  cause: Schema.Defect(),
}) {}
