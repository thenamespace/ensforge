import { Schema } from "effect";

export const WalletErrorCode = Schema.Literals([
  "USER_REJECTED",
  "UNAUTHORIZED_ACCOUNT",
  "BATCH_UNSUPPORTED",
  "ATOMICITY_UNAVAILABLE",
  "CAPABILITY_REQUEST_FAILED",
  "CAPABILITY_UNAVAILABLE",
  "BATCH_SUBMISSION_FAILED",
]);
export type WalletErrorCode = typeof WalletErrorCode.Type;

export class WalletError extends Schema.TaggedError<WalletError>()("WalletError", {
  code: WalletErrorCode,
  message: Schema.String,
  cause: Schema.Defect(),
}) {}
