import { Schema } from "effect";

import { EthereumAddress } from "../../../../schemas/identity.js";
import {
  IndexerCursor,
  IndexerPage,
  type IndexerPage as IndexerPageType,
} from "../../models/pagination.js";
import {
  IndexedRegistryName,
  RegistryNameRelationship,
  type IndexedRegistryName as IndexedRegistryNameType,
} from "../../models/registry.js";
import {
  V2IndexerResult,
  type V2IndexerResult as V2IndexerResultType,
} from "../../models/v2-support.js";
import type { RegistryIndexerError } from "../types.js";

const PositivePageSize = Schema.Int.pipe(Schema.check(Schema.isGreaterThan(0)));

export const GetRegistryLabelsParameters = Schema.Struct({
  address: EthereumAddress,
  relationship: Schema.optional(RegistryNameRelationship),
  pageSize: Schema.optional(PositivePageSize),
  cursor: Schema.optional(IndexerCursor),
});
export type GetRegistryLabelsParameters = typeof GetRegistryLabelsParameters.Type;

export const GetRegistryLabelsPage = IndexerPage(IndexedRegistryName);
export type GetRegistryLabelsPage = IndexerPageType<IndexedRegistryNameType>;

export const GetRegistryLabelsResult = V2IndexerResult(GetRegistryLabelsPage);
export type GetRegistryLabelsResult = V2IndexerResultType<GetRegistryLabelsPage>;

export type GetRegistryLabelsError = RegistryIndexerError;
