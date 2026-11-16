import { Schema } from "effect";

import { IndexedName } from "../../models/name.js";
import {
  IndexerCursor,
  IndexerPage,
  type IndexerPage as IndexerPageType,
} from "../../models/pagination.js";
import { NameFilter, NameOrder } from "../../models/query.js";
import type { GetNamesError } from "../get-names/types.js";

const PositivePageSize = Schema.Int.pipe(Schema.check(Schema.isGreaterThan(0)));

export const GetSubnamesParameters = Schema.Struct({
  name: Schema.String,
  filter: Schema.optional(NameFilter),
  order: Schema.optional(NameOrder),
  pageSize: Schema.optional(PositivePageSize),
  cursor: Schema.optional(IndexerCursor),
});
export type GetSubnamesParameters = typeof GetSubnamesParameters.Type;

export const GetSubnamesResult = IndexerPage(IndexedName);
export type GetSubnamesResult = IndexerPageType<typeof IndexedName.Type>;

export type GetSubnamesError = GetNamesError;
