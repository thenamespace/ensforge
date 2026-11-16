import { Schema } from "effect";

import { EthereumAddress } from "../../../../schemas/identity.js";
import { IndexerCursor, IndexerPage } from "../../models/pagination.js";
import {
  IndexedRegistry,
  type IndexedRegistry as IndexedRegistryType,
} from "../../models/registry.js";
import {
  V2IndexerResult,
  type V2IndexerResult as V2IndexerResultType,
} from "../../models/v2-support.js";
import type { RegistryIndexerError } from "../types.js";

const PositivePageSize = Schema.Int.pipe(Schema.check(Schema.isGreaterThan(0)));

export const GetRegistriesForAddressParameters = Schema.Struct({
  address: EthereumAddress,
  pageSize: Schema.optional(PositivePageSize),
  cursor: Schema.optional(IndexerCursor),
});
export type GetRegistriesForAddressParameters = typeof GetRegistriesForAddressParameters.Type;

export const GetRegistriesForAddressPage = IndexerPage(IndexedRegistry);
export type GetRegistriesForAddressPage = {
  readonly items: ReadonlyArray<IndexedRegistryType>;
  readonly pageInfo: (typeof GetRegistriesForAddressPage.Type)["pageInfo"];
  readonly sources: (typeof GetRegistriesForAddressPage.Type)["sources"];
};

export const GetRegistriesForAddressResult = V2IndexerResult(GetRegistriesForAddressPage);
export type GetRegistriesForAddressResult = V2IndexerResultType<GetRegistriesForAddressPage>;

export type GetRegistriesForAddressError = RegistryIndexerError;
