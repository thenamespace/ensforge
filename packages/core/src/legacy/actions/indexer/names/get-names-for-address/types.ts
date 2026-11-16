import { Schema } from "effect";

import { EthereumAddress } from "../../../../schemas/identity.js";
import {
  NameRelation,
  RelatedIndexedName,
  type RelatedIndexedName as RelatedIndexedNameType,
} from "../../models/name.js";
import type { IndexerPage as IndexerPageType } from "../../models/pagination.js";
import { IndexerCursor, IndexerPage } from "../../models/pagination.js";
import { NameFilter, NameOrder } from "../../models/query.js";
import type { GetNamesError } from "../get-names/types.js";

const PositivePageSize = Schema.Int.pipe(Schema.check(Schema.isGreaterThan(0)));

export const GetNamesForAddressParameters = Schema.Struct({
  address: EthereumAddress,
  relations: Schema.optional(Schema.Array(NameRelation)),
  filter: Schema.optional(NameFilter),
  order: Schema.optional(NameOrder),
  pageSize: Schema.optional(PositivePageSize),
  cursor: Schema.optional(IndexerCursor),
});
export type GetNamesForAddressParameters = typeof GetNamesForAddressParameters.Type;

export const GetNamesForAddressResult = IndexerPage(RelatedIndexedName);
export type GetNamesForAddressResult = IndexerPageType<RelatedIndexedNameType>;

export type GetNamesForAddressError = GetNamesError;

export const defaultAddressRelations = Object.freeze(["owner"] as const);
