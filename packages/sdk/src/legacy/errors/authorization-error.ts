import { Schema } from "effect";

export const AuthorizationErrorCode = Schema.Literals([
  "WRITE_TARGET_UNAVAILABLE",
  "RECORD_UNSUPPORTED",
  "SCOPE_WIDENING_REQUIRED",
  "UNAUTHORIZED",
]);

export type AuthorizationErrorCode = typeof AuthorizationErrorCode.Type;

export class AuthorizationError extends Schema.TaggedError<AuthorizationError>()(
  "AuthorizationError",
  {
    code: AuthorizationErrorCode,
    message: Schema.String,
  },
) {}
