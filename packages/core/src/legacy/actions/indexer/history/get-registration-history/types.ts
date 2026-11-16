import { Schema } from "effect";

import { Namehash } from "../../../../schemas/hash.js";
import { IndexerCursor } from "../../models/pagination.js";
import type { GetEventsError, GetEventsResult } from "../get-events/types.js";

const PositivePageSize = Schema.Int.pipe(Schema.check(Schema.isGreaterThan(0)));

export const GetRegistrationHistoryParameters = Schema.Struct({
  name: Schema.optional(Schema.String),
  namehash: Schema.optional(Namehash),
  pageSize: Schema.optional(PositivePageSize),
  cursor: Schema.optional(IndexerCursor),
});
export type GetRegistrationHistoryParameters = typeof GetRegistrationHistoryParameters.Type;

export type GetRegistrationHistoryResult = GetEventsResult;

export type GetRegistrationHistoryError = GetEventsError;
