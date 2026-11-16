import { Schema } from "effect";

export const RpcErrorCode = Schema.Literals([
  "REQUEST_FAILED",
  "REQUEST_TIMEOUT",
  "TRANSPORT_FAILED",
]);

export type RpcErrorCode = typeof RpcErrorCode.Type;

export class RpcError extends Schema.TaggedError<RpcError>()("RpcError", {
  code: RpcErrorCode,
  message: Schema.String,
  cause: Schema.Defect(),
}) {}
