import { Schema } from "effect";

export const ConfigErrorCode = Schema.Literals([
  "UNSUPPORTED_NETWORK",
  "INVALID_CUSTOM_NETWORK",
  "INVALID_CLIENT_CONFIGURATION",
  "PUBLIC_CLIENT_UNAVAILABLE",
  "CLIENT_CHAIN_UNAVAILABLE",
  "NETWORK_CLIENT_MISMATCH",
  "DEPLOYMENT_CHAIN_MISMATCH",
  "DUPLICATE_DEPLOYMENT",
  "WALLET_CLIENT_UNAVAILABLE",
  "WALLET_ACCOUNT_UNAVAILABLE",
  "INVALID_READ_OPTIONS",
  "INVALID_WRITE_OPTIONS",
  "INVALID_GATEWAY_OPTIONS",
  "INVALID_INDEXER_OPTIONS",
]);

export type ConfigErrorCode = typeof ConfigErrorCode.Type;

export class ConfigError extends Schema.TaggedError<ConfigError>()("ConfigError", {
  code: ConfigErrorCode,
  message: Schema.String,
}) {}
