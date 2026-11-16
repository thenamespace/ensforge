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
  IndexerCursor,
  IndexerPage,
  type IndexerPage as IndexerPageType,
} from "../../models/pagination.js";
import {
  IndexedRegistration,
  RegistrationFilter,
  RegistrationOrder,
  type IndexedRegistration as IndexedRegistrationType,
} from "../../models/registration.js";

const PositivePageSize = Schema.Int.pipe(Schema.check(Schema.isGreaterThan(0)));

export const GetRegistrationsParameters = Schema.Struct({
  filter: Schema.optional(RegistrationFilter),
  order: Schema.optional(RegistrationOrder),
  pageSize: Schema.optional(PositivePageSize),
  cursor: Schema.optional(IndexerCursor),
});
export type GetRegistrationsParameters = typeof GetRegistrationsParameters.Type;

export const GetRegistrationsResult = IndexerPage(IndexedRegistration);
export type GetRegistrationsResult = IndexerPageType<IndexedRegistrationType>;

export type GetRegistrationsError =
  | IndexerConfigError
  | IndexerDecodeError
  | IndexerFilterError
  | IndexerPaginationError
  | IndexerRequestError
  | IndexerResponseError
  | IndexerUnavailableError;
