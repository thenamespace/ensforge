import { Schema } from "effect";

export const ReverseNameErrorCode = Schema.Literals([
  "FORWARD_ADDRESS_MISMATCH",
  "TARGET_NOT_CONTRACT",
]);

export type ReverseNameErrorCode = typeof ReverseNameErrorCode.Type;

export class ReverseNameError extends Schema.TaggedError<ReverseNameError>()("ReverseNameError", {
  code: ReverseNameErrorCode,
  message: Schema.String,
}) {}
