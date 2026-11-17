import { Schema } from "effect";

export const MigrationErrorCode = Schema.Literals([
  "MIGRATION_UNSUPPORTED",
  "MIGRATION_NOT_REQUIRED",
  "MIGRATION_BLOCKED",
  "AUTHORIZATION_REQUIRED",
  "HELPER_APPROVAL_REQUIRED",
  "ROUTE_CHANGED",
  "INVALID_MIGRATION_BATCH",
  "MIGRATION_FAILED",
]);

export type MigrationErrorCode = typeof MigrationErrorCode.Type;

export class MigrationError extends Schema.TaggedError<MigrationError>()("MigrationError", {
  code: MigrationErrorCode,
  message: Schema.String,
}) {}
