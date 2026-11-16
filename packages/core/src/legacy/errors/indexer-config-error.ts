import { Schema } from "effect";

export const IndexerConfigErrorCode = Schema.Literals([
  "INDEXER_DISABLED",
  "SOURCE_DISABLED",
  "HEADERS_FAILED",
]);

export type IndexerConfigErrorCode = typeof IndexerConfigErrorCode.Type;

export class IndexerConfigError extends Schema.TaggedError<IndexerConfigError>()(
  "IndexerConfigError",
  {
    code: IndexerConfigErrorCode,
    message: Schema.String,
    cause: Schema.optional(Schema.Defect()),
  },
) {}
