import { Schema } from "effect";

export class WorkflowError extends Schema.TaggedError<WorkflowError>()("WorkflowError", {
  code: Schema.Literals([
    "INVALID_STATE",
    "STORAGE_FAILED",
    "CONFLICT",
    "BUSY",
    "NOT_FOUND",
    "SUBMISSION_UNCERTAIN",
    "IDENTITY_MISMATCH",
  ]),
  message: Schema.String,
  workflowId: Schema.optional(Schema.String),
  cause: Schema.optional(Schema.Defect()),
}) {}
