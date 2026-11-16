import { Schema } from "effect";

import { EnsNetworkIdSchema } from "../../../config/network.js";

export const V2IndexerUnsupportedReason = Schema.Literals([
  "V2_INDEXER_DISABLED",
  "V2_INDEXER_UNAVAILABLE",
]);
export type V2IndexerUnsupportedReason = typeof V2IndexerUnsupportedReason.Type;

export const V2IndexerUnsupported = Schema.Struct({
  status: Schema.Literal("unsupported"),
  network: EnsNetworkIdSchema,
  reason: V2IndexerUnsupportedReason,
});
export type V2IndexerUnsupported = typeof V2IndexerUnsupported.Type;

export interface V2IndexerSupported<Value> {
  readonly status: "supported";
  readonly value: Value;
}

export type V2IndexerResult<Value> = V2IndexerSupported<Value> | V2IndexerUnsupported;

export const V2IndexerResult = <Value extends Schema.Top>(value: Value) =>
  Schema.Union([
    Schema.Struct({ status: Schema.Literal("supported"), value }),
    V2IndexerUnsupported,
  ]);
