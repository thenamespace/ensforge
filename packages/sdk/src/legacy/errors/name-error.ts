import { Schema } from "effect";

export const NameErrorCode = Schema.Literals(["INVALID_NAME", "INVALID_LABEL"]);

export type NameErrorCode = typeof NameErrorCode.Type;

export class NameError extends Schema.TaggedError<NameError>()("NameError", {
  code: NameErrorCode,
  message: Schema.String,
}) {}
