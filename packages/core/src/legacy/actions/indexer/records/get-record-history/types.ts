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
import { Namehash } from "../../../../schemas/hash.js";
import {
  IndexerCursor,
  IndexerPage,
  type IndexerPage as IndexerPageType,
} from "../../models/pagination.js";
import {
  IndexedRecordEvent,
  RecordHistoryFilter,
  RecordHistoryOrder,
  type IndexedRecordEvent as IndexedRecordEventType,
} from "../../models/record.js";

const PositivePageSize = Schema.Int.pipe(Schema.check(Schema.isGreaterThan(0)));

export const GetRecordHistoryParameters = Schema.Struct({
  name: Schema.optional(Schema.String),
  namehash: Schema.optional(Namehash),
  filter: Schema.optional(RecordHistoryFilter),
  order: Schema.optional(RecordHistoryOrder),
  pageSize: Schema.optional(PositivePageSize),
  cursor: Schema.optional(IndexerCursor),
});
export type GetRecordHistoryParameters = typeof GetRecordHistoryParameters.Type;

export const GetRecordHistoryResult = IndexerPage(IndexedRecordEvent);
export type GetRecordHistoryResult = IndexerPageType<IndexedRecordEventType>;

export type GetRecordHistoryError =
  | IndexerConfigError
  | IndexerDecodeError
  | IndexerFilterError
  | IndexerPaginationError
  | IndexerRequestError
  | IndexerResponseError
  | IndexerUnavailableError;
