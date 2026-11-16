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
import {
  EventFilter,
  EventOrder,
  IndexedEvent,
  type IndexedEvent as IndexedEventType,
} from "../../models/event.js";
import {
  IndexerCursor,
  IndexerPage,
  type IndexerPage as IndexerPageType,
} from "../../models/pagination.js";

const PositivePageSize = Schema.Int.pipe(Schema.check(Schema.isGreaterThan(0)));

export const GetEventsParameters = Schema.Struct({
  filter: Schema.optional(EventFilter),
  order: Schema.optional(EventOrder),
  pageSize: Schema.optional(PositivePageSize),
  cursor: Schema.optional(IndexerCursor),
});
export type GetEventsParameters = typeof GetEventsParameters.Type;

export const GetEventsResult = IndexerPage(IndexedEvent);
export type GetEventsResult = IndexerPageType<IndexedEventType>;

export type GetEventsError =
  | IndexerConfigError
  | IndexerDecodeError
  | IndexerFilterError
  | IndexerPaginationError
  | IndexerRequestError
  | IndexerResponseError
  | IndexerUnavailableError;
