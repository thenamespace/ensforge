import { Schema } from "effect";

export const DnsImportErrorCode = Schema.Literals([
  "CLAIM_NOT_CONFIRMED",
  "DNS_REGISTRAR_UNAVAILABLE",
  "INVALID_PROOF",
  "RESOLVER_REQUIRED",
  "RESUME_MISMATCH",
]);

export type DnsImportErrorCode = typeof DnsImportErrorCode.Type;

export class DnsImportError extends Schema.TaggedError<DnsImportError>()("DnsImportError", {
  code: DnsImportErrorCode,
  message: Schema.String,
}) {}
