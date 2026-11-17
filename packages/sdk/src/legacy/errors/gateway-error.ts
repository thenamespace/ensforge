import { Schema } from "effect";

export const GatewayErrorCode = Schema.Literals([
  "AVATAR_RESOLUTION_FAILED",
  "GATEWAY_NOT_ALLOWED",
  "GATEWAY_TIMEOUT",
]);

export type GatewayErrorCode = typeof GatewayErrorCode.Type;

export class GatewayError extends Schema.TaggedError<GatewayError>()("GatewayError", {
  code: GatewayErrorCode,
  message: Schema.String,
  cause: Schema.Defect(),
}) {}
