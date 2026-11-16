import { Schema } from "effect";

import { EnsNetworkIdSchema } from "../config/network.js";

export const IndexerGraphQLError = Schema.Struct({
  message: Schema.String,
  path: Schema.optional(Schema.Array(Schema.Union([Schema.String, Schema.Number]))),
  locations: Schema.optional(
    Schema.Array(Schema.Struct({ line: Schema.Number, column: Schema.Number })),
  ),
  extensions: Schema.optional(Schema.Unknown),
});

export type IndexerGraphQLError = typeof IndexerGraphQLError.Type;

export class IndexerResponseError extends Schema.TaggedError<IndexerResponseError>()(
  "IndexerResponseError",
  {
    code: Schema.Literal("GRAPHQL_FAILED"),
    message: Schema.String,
    network: EnsNetworkIdSchema,
    protocol: Schema.Literals(["v1", "v2"]),
    operationName: Schema.String,
    errors: Schema.Array(IndexerGraphQLError),
    data: Schema.optional(Schema.Unknown),
  },
) {}
