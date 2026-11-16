import { Schema } from "effect";

import { EthereumAddress } from "../../../../schemas/identity.js";
import { IndexedResolverMetadata } from "../../models/resolver.js";
import {
  V2IndexerResult,
  type V2IndexerResult as V2IndexerResultType,
} from "../../models/v2-support.js";
import type { ResolverIndexerError } from "../types.js";

export const GetResolverMetadataParameters = Schema.Struct({ resolver: EthereumAddress });
export type GetResolverMetadataParameters = typeof GetResolverMetadataParameters.Type;

export const GetResolverMetadataResult = V2IndexerResult(Schema.NullOr(IndexedResolverMetadata));
export type GetResolverMetadataResult = V2IndexerResultType<IndexedResolverMetadata | null>;

export type GetResolverMetadataError = ResolverIndexerError;
