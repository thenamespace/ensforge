import { Schema } from "effect";

export const IndexerFilterErrorCode = Schema.Literals(["INVALID_FILTER", "UNSUPPORTED_FILTER"]);
export type IndexerFilterErrorCode = typeof IndexerFilterErrorCode.Type;

export class IndexerFilterError extends Schema.TaggedError<IndexerFilterError>()(
  "IndexerFilterError",
  {
    code: IndexerFilterErrorCode,
    message: Schema.String,
  },
) {}
