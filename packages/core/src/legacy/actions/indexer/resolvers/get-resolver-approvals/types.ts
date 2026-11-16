import { Schema } from "effect";

import {
  IndexerCursor,
  IndexerPage,
  type IndexerPage as IndexerPageType,
} from "../../models/pagination.js";
import {
  IndexedResolverApproval,
  ResolverApprovalFilter,
  type IndexedResolverApproval as IndexedResolverApprovalType,
} from "../../models/resolver.js";
import {
  V2IndexerResult,
  type V2IndexerResult as V2IndexerResultType,
} from "../../models/v2-support.js";
import type { ResolverIndexerError } from "../types.js";

const PositivePageSize = Schema.Int.pipe(Schema.check(Schema.isGreaterThan(0)));

export const GetResolverApprovalsParameters = Schema.Struct({
  filter: ResolverApprovalFilter,
  pageSize: Schema.optional(PositivePageSize),
  cursor: Schema.optional(IndexerCursor),
});
export type GetResolverApprovalsParameters = typeof GetResolverApprovalsParameters.Type;

export const GetResolverApprovalsPage = IndexerPage(IndexedResolverApproval);
export type GetResolverApprovalsPage = IndexerPageType<IndexedResolverApprovalType>;

export const GetResolverApprovalsResult = V2IndexerResult(GetResolverApprovalsPage);
export type GetResolverApprovalsResult = V2IndexerResultType<GetResolverApprovalsPage>;

export type GetResolverApprovalsError = ResolverIndexerError;
