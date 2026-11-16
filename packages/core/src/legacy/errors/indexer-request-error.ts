import { Schema } from "effect";

import { EnsNetworkIdSchema } from "../config/network.js";

export const IndexerRequestErrorCode = Schema.Literals([
  "TRANSPORT_FAILED",
  "REQUEST_TIMEOUT",
  "REQUEST_ABORTED",
  "HTTP_FAILED",
]);

export type IndexerRequestErrorCode = typeof IndexerRequestErrorCode.Type;

export class IndexerRequestError extends Schema.TaggedError<IndexerRequestError>()(
  "IndexerRequestError",
  {
    code: IndexerRequestErrorCode,
    message: Schema.String,
    network: EnsNetworkIdSchema,
    protocol: Schema.Literals(["v1", "v2"]),
    operationName: Schema.String,
    attempt: Schema.Int,
    retryable: Schema.Boolean,
    status: Schema.optional(Schema.Int),
    retryAfter: Schema.optional(Schema.Number),
    cause: Schema.Defect(),
  },
) {}
