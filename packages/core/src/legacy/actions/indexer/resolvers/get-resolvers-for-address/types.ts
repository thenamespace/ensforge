import { Schema } from "effect";

import { EthereumAddress } from "../../../../schemas/identity.js";
import {
  IndexerCursor,
  IndexerPage,
  type IndexerPage as IndexerPageType,
} from "../../models/pagination.js";
import {
  IndexedOwnedResolver,
  type IndexedOwnedResolver as IndexedOwnedResolverType,
} from "../../models/resolver.js";
import {
  V2IndexerResult,
  type V2IndexerResult as V2IndexerResultType,
} from "../../models/v2-support.js";
import type { ResolverIndexerError } from "../types.js";

const PositivePageSize = Schema.Int.pipe(Schema.check(Schema.isGreaterThan(0)));

export const GetResolversForAddressParameters = Schema.Struct({
  address: EthereumAddress,
  pageSize: Schema.optional(PositivePageSize),
  cursor: Schema.optional(IndexerCursor),
});
export type GetResolversForAddressParameters = typeof GetResolversForAddressParameters.Type;

export const GetResolversForAddressPage = IndexerPage(IndexedOwnedResolver);
export type GetResolversForAddressPage = IndexerPageType<IndexedOwnedResolverType>;

export const GetResolversForAddressResult = V2IndexerResult(GetResolversForAddressPage);
export type GetResolversForAddressResult = V2IndexerResultType<GetResolversForAddressPage>;

export type GetResolversForAddressError = ResolverIndexerError;
