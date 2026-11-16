import { Effect } from "effect";

import { IndexerPaginationError } from "../../../errors/indexer-pagination-error.js";

export const decodeLocalOffset = Effect.fn("decodeLocalOffset")(function* (
  position: string | null,
  description: string,
): Effect.fn.Return<number, IndexerPaginationError> {
  return yield* Effect.try({
    try: () => {
      const offset = position === null ? 0 : Number(position);

      if (!Number.isSafeInteger(offset) || offset < 0) throw new Error("Invalid offset");

      return offset;
    },
    catch: (cause) =>
      new IndexerPaginationError({
        code: "INVALID_CURSOR",
        message: `The ${description} cursor contains an invalid position`,
        cause,
      }),
  });
});
