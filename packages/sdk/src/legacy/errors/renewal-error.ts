import { Schema } from "effect";

export const RenewalErrorCode = Schema.Literals([
  "NAME_NOT_RENEWABLE",
  "PAYMENT_TOKEN_REQUIRED",
  "PAYMENT_TOKEN_UNSUPPORTED",
  "PRICE_EXCEEDS_MAXIMUM",
  "TOTAL_PRICE_EXCEEDS_MAXIMUM",
  "INSUFFICIENT_ALLOWANCE",
  "ROUTE_CHANGED",
  "RENEWAL_FAILED",
]);

export type RenewalErrorCode = typeof RenewalErrorCode.Type;

export class RenewalError extends Schema.TaggedError<RenewalError>()("RenewalError", {
  code: RenewalErrorCode,
  message: Schema.String,
}) {}
