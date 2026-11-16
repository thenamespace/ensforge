import { Schema } from "effect";

import { EthereumAddress } from "../../../../schemas/identity.js";
import {
  IndexerCursor,
  IndexerPage,
  type IndexerPage as IndexerPageType,
} from "../../models/pagination.js";
import {
  IndexedRegistryRole,
  RegistryRoleFilter,
  type IndexedRegistryRole as IndexedRegistryRoleType,
} from "../../models/registry.js";
import {
  V2IndexerResult,
  type V2IndexerResult as V2IndexerResultType,
} from "../../models/v2-support.js";
import type { RegistryIndexerError } from "../types.js";

const PositivePageSize = Schema.Int.pipe(Schema.check(Schema.isGreaterThan(0)));

export const GetRegistryRolesParameters = Schema.Struct({
  registry: EthereumAddress,
  filter: Schema.optional(RegistryRoleFilter),
  pageSize: Schema.optional(PositivePageSize),
  cursor: Schema.optional(IndexerCursor),
});
export type GetRegistryRolesParameters = typeof GetRegistryRolesParameters.Type;

export const GetRegistryRolesPage = IndexerPage(IndexedRegistryRole);
export type GetRegistryRolesPage = IndexerPageType<IndexedRegistryRoleType>;

export const GetRegistryRolesResult = V2IndexerResult(GetRegistryRolesPage);
export type GetRegistryRolesResult = V2IndexerResultType<GetRegistryRolesPage>;

export type GetRegistryRolesError = RegistryIndexerError;
