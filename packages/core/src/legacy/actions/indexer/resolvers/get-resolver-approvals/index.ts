import { Array as Arr, Effect, Order, Schema } from "effect";

import { getAddress } from "viem";

import { defineAction } from "../../../../action/action.js";
import type { EnsforgeConfig } from "../../../../config/config.js";
import { IndexerConfigError } from "../../../../errors/indexer-config-error.js";
import { IndexerFilterError } from "../../../../errors/indexer-filter-error.js";
import { requestIndexer } from "../../../../internal/indexer/client.js";
import {
  V2GetResolverApprovalsDocument,
  type V2GetResolverApprovalsQuery,
  type V2GetResolverApprovalsQueryVariables,
} from "../../../../internal/indexer/generated/v2/get-resolver-approvals.js";
import { normalizeV2ResolverApproval } from "../../../../internal/indexer/normalize/resolver.js";
import {
  decodeIndexerCursor,
  encodeIndexerCursor,
  makeIndexerCursorBinding,
} from "../../../../internal/indexer/pagination/cursor.js";
import { decodeLocalOffset } from "../../../../internal/indexer/pagination/local-offset.js";
import { decodeIndexedBlock, requireIndexerData } from "../../../../internal/indexer/response.js";
import { getV2IndexerUnsupported } from "../../../../internal/indexer/v2-support.js";
import type { IndexedResolverApproval, ResolverApprovalFilter } from "../../models/resolver.js";
import {
  GetResolverApprovalsParameters as GetResolverApprovalsParametersSchema,
  type GetResolverApprovalsError,
  type GetResolverApprovalsParameters,
  type GetResolverApprovalsResult,
} from "./types.js";

const matchesApprovalFilter = (approval: IndexedResolverApproval, filter: ResolverApprovalFilter) =>
  (filter.resolver === undefined ||
    approval.resolver.toLowerCase() === filter.resolver.toLowerCase()) &&
  (filter.namehash === undefined ||
    approval.namehash.toLowerCase() === filter.namehash.toLowerCase()) &&
  (filter.context === undefined ||
    approval.context?.toLowerCase() === filter.context.toLowerCase()) &&
  (filter.delegate === undefined ||
    approval.delegate.toLowerCase() === filter.delegate.toLowerCase()) &&
  (filter.approved === undefined || approval.approved === filter.approved) &&
  (filter.blockAfter === undefined || approval.blockNumber > filter.blockAfter) &&
  (filter.blockBefore === undefined || approval.blockNumber < filter.blockBefore) &&
  (filter.timestampAfter === undefined || approval.timestamp > filter.timestampAfter) &&
  (filter.timestampBefore === undefined || approval.timestamp < filter.timestampBefore);

const approvalOrder = Order.make<IndexedResolverApproval>((left, right) => {
  if (left.blockNumber !== right.blockNumber) return left.blockNumber > right.blockNumber ? -1 : 1;

  if (left.logIndex !== right.logIndex) return left.logIndex > right.logIndex ? -1 : 1;

  return left.id < right.id ? -1 : left.id > right.id ? 1 : 0;
});

const getResolverApprovalsEffect = Effect.fn("ensforge.getResolverApprovals")(function* (
  config: EnsforgeConfig,
  parameters: GetResolverApprovalsParameters,
): Effect.fn.Return<GetResolverApprovalsResult, GetResolverApprovalsError> {
  if (!config.indexer.enabled) {
    return yield* new IndexerConfigError({
      code: "INDEXER_DISABLED",
      message: "Indexer actions are disabled for this configuration",
    });
  }

  const decoded = yield* Schema.decodeUnknownEffect(GetResolverApprovalsParametersSchema)(
    parameters,
  ).pipe(
    Effect.mapError(
      () =>
        new IndexerFilterError({
          code: "INVALID_FILTER",
          message: "The resolver approval query parameters are invalid",
        }),
    ),
  );

  const unsupported = getV2IndexerUnsupported(config);

  if (unsupported !== null) return unsupported;

  if (decoded.filter.namehash === undefined && decoded.filter.delegate === undefined) {
    return yield* new IndexerFilterError({
      code: "INVALID_FILTER",
      message: "Filter resolver approvals by namehash or delegate",
    });
  }

  const filter: ResolverApprovalFilter = {
    ...decoded.filter,
    ...(decoded.filter.resolver !== undefined && {
      resolver: getAddress(decoded.filter.resolver),
    }),
    ...(decoded.filter.delegate !== undefined && {
      delegate: getAddress(decoded.filter.delegate),
    }),
  };

  const pageSize = decoded.pageSize ?? Math.min(20, config.indexer.maximumPageSize);

  if (pageSize > config.indexer.maximumPageSize) {
    return yield* new IndexerFilterError({
      code: "INVALID_FILTER",
      message: `pageSize cannot exceed ${config.indexer.maximumPageSize}`,
    });
  }

  const binding = makeIndexerCursorBinding(config, "getResolverApprovals", filter, null);

  const positions =
    decoded.cursor === undefined
      ? { v1: { position: null, exhausted: true }, v2: { position: null, exhausted: false } }
      : (yield* decodeIndexerCursor(decoded.cursor, binding)).sources;

  const offset = yield* decodeLocalOffset(positions.v2.position, "resolver approval");
  const operationName = "V2GetResolverApprovals";

  const response = yield* requestIndexer<
    V2GetResolverApprovalsQuery,
    V2GetResolverApprovalsQueryVariables
  >(config, {
    protocol: "v2",
    operationName,
    document: V2GetResolverApprovalsDocument,
    variables: {
      delegate: filter.delegate?.toLowerCase() ?? null,
      namehash: filter.namehash?.toLowerCase() ?? null,
    },
  });

  const data = yield* requireIndexerData(config, "v2", operationName, response);

  const indexedBlock = yield* decodeIndexedBlock(
    config,
    "v2",
    operationName,
    data["_meta"].block.number,
  );

  const normalized = yield* Effect.all(
    data.approvals.map((approval) =>
      normalizeV2ResolverApproval(approval, {
        network: config.network,
        protocol: "v2",
        indexedBlock,
        operationName,
      }),
    ),
    { concurrency: "unbounded" },
  );

  const filtered = Arr.sort(
    normalized.filter((approval) => matchesApprovalFilter(approval, filter)),
    approvalOrder,
  );

  const items = filtered.slice(offset, offset + pageSize);
  const nextOffset = offset + items.length;
  const hasNextPage = nextOffset < filtered.length;

  const cursor = hasNextPage
    ? yield* encodeIndexerCursor(binding, {
        v1: { position: null, exhausted: true },
        v2: { position: String(nextOffset), exhausted: false },
      })
    : null;

  return {
    status: "supported",
    value: {
      items,
      pageInfo: { cursor, hasNextPage },
      sources: [{ protocol: "v2", status: "complete", indexedBlock, hasNextPage }],
    },
  };
});

export const getResolverApprovals = defineAction(getResolverApprovalsEffect);

export {
  GetResolverApprovalsPage,
  GetResolverApprovalsParameters,
  GetResolverApprovalsResult,
  type GetResolverApprovalsError,
  type GetResolverApprovalsPage as GetResolverApprovalsPageType,
  type GetResolverApprovalsParameters as GetResolverApprovalsParametersType,
  type GetResolverApprovalsResult as GetResolverApprovalsResultType,
} from "./types.js";
