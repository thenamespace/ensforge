import { Schema } from "effect";

export const IndexerPaginationErrorCode = Schema.Literals(["INVALID_CURSOR", "CURSOR_MISMATCH"]);
export type IndexerPaginationErrorCode = typeof IndexerPaginationErrorCode.Type;

export class IndexerPaginationError extends Schema.TaggedError<IndexerPaginationError>()(
  "IndexerPaginationError",
  {
    code: IndexerPaginationErrorCode,
    message: Schema.String,
    cause: Schema.optional(Schema.Defect()),
  },
) {}
