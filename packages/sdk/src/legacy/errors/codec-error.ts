import { Schema } from "effect";

export const CodecErrorCode = Schema.Literals([
  "INVALID_DNS_NAME",
  "MALFORMED_DNS_PACKET",
  "INVALID_CHAIN_ID",
  "INVALID_COIN_TYPE",
  "UNSUPPORTED_COIN_TYPE",
  "INVALID_ADDRESS_RECORD",
  "INVALID_CONTENT_HASH",
  "UNSUPPORTED_CONTENT_PROTOCOL",
  "INVALID_ABI",
  "UNSUPPORTED_ABI_CONTENT_TYPE",
  "INVALID_INTERFACE_ID",
  "INVALID_ADDRESS",
  "INVALID_HEX",
]);

export type CodecErrorCode = typeof CodecErrorCode.Type;

export class CodecError extends Schema.TaggedError<CodecError>()("CodecError", {
  code: CodecErrorCode,
  message: Schema.String,
}) {}
