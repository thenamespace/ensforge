import { Schema } from "effect";

export const RegistrationErrorCode = Schema.Literals([
  "NAME_UNAVAILABLE",
  "PAYMENT_TOKEN_REQUIRED",
  "PAYMENT_TOKEN_UNSUPPORTED",
  "COMMITMENT_NOT_FOUND",
  "COMMITMENT_PENDING",
  "COMMITMENT_EXPIRED",
  "PRICE_EXCEEDS_MAXIMUM",
  "INSUFFICIENT_ALLOWANCE",
  "REGISTRATION_FAILED",
]);

export type RegistrationErrorCode = typeof RegistrationErrorCode.Type;

export class RegistrationError extends Schema.TaggedError<RegistrationError>()(
  "RegistrationError",
  {
    code: RegistrationErrorCode,
    message: Schema.String,
  },
) {}
