import { Schema } from "effect";

import type {
  IndexerConfigError,
  IndexerDecodeError,
  IndexerFilterError,
  IndexerPaginationError,
  IndexerRequestError,
  IndexerResponseError,
  IndexerUnavailableError,
} from "../../../../errors/index.js";
import { IndexedName, type IndexedName as IndexedNameType } from "../../models/name.js";
import {
  IndexerCursor,
  IndexerPage,
  type IndexerPage as IndexerPageType,
} from "../../models/pagination.js";
import { NameFilter, NameOrder } from "../../models/query.js";

const PositivePageSize = Schema.Int.pipe(Schema.check(Schema.isGreaterThan(0)));

export const GetNamesParameters = Schema.Struct({
  filter: Schema.optional(NameFilter),
  order: Schema.optional(NameOrder),
  pageSize: Schema.optional(PositivePageSize),
  cursor: Schema.optional(IndexerCursor),
});
export type GetNamesParameters = typeof GetNamesParameters.Type;

export const GetNamesResult = IndexerPage(IndexedName);
export type GetNamesResult = IndexerPageType<IndexedNameType>;

export type GetNamesError =
  | IndexerConfigError
  | IndexerDecodeError
  | IndexerFilterError
  | IndexerPaginationError
  | IndexerRequestError
  | IndexerResponseError
  | IndexerUnavailableError;
