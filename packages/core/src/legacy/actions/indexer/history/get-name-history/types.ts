import { Schema } from "effect";

import { Namehash } from "../../../../schemas/hash.js";
import { IndexedEventKind } from "../../models/event.js";
import { IndexerCursor } from "../../models/pagination.js";
import type { GetEventsError, GetEventsResult } from "../get-events/types.js";

const PositivePageSize = Schema.Int.pipe(Schema.check(Schema.isGreaterThan(0)));

export const GetNameHistoryParameters = Schema.Struct({
  name: Schema.optional(Schema.String),
  namehash: Schema.optional(Namehash),
  kinds: Schema.optional(Schema.Array(IndexedEventKind)),
  pageSize: Schema.optional(PositivePageSize),
  cursor: Schema.optional(IndexerCursor),
});
export type GetNameHistoryParameters = typeof GetNameHistoryParameters.Type;

export type GetNameHistoryResult = GetEventsResult;

export type GetNameHistoryError = GetEventsError;
