import { Schema } from "effect";

import { EthereumAddress } from "../../../../schemas/identity.js";
import { IndexedRegistry } from "../../models/registry.js";
import {
  V2IndexerResult,
  type V2IndexerResult as V2IndexerResultType,
} from "../../models/v2-support.js";
import type { RegistryIndexerError } from "../types.js";

export const GetRegistryParameters = Schema.Union([
  Schema.Struct({ address: EthereumAddress, name: Schema.optional(Schema.Never) }),
  Schema.Struct({ address: Schema.optional(Schema.Never), name: Schema.String }),
]);
export type GetRegistryParameters = typeof GetRegistryParameters.Type;

export const GetRegistryResult = V2IndexerResult(Schema.NullOr(IndexedRegistry));
export type GetRegistryResult = V2IndexerResultType<IndexedRegistry | null>;

export type GetRegistryError = RegistryIndexerError;
