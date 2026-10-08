import { Effect, Schema } from "effect";

import { normalize } from "viem/ens";

import { defineAction } from "../../../../action/action.js";
import type { EnsforgeConfig } from "../../../../config/config.js";
import {
  getIndexerRuntimeConfig,
  type IndexerProtocol,
  type IndexerSourceState,
} from "../../../../config/indexer-options.js";
import { IndexerConfigError } from "../../../../errors/indexer-config-error.js";
import { IndexerFilterError } from "../../../../errors/indexer-filter-error.js";
import {
  decodeIndexerCursor,
  encodeIndexerCursor,
  makeIndexerCursorBinding,
  type IndexerCursorPositions,
} from "../../../../internal/indexer/pagination/cursor.js";
import {
  collectIndexerSourcePages,
  mergeIndexerPages,
  type IndexerMergeSource,
  type IndexerSourcePageResult,
} from "../../../../internal/indexer/pagination/merge.js";
import {
  compileV1NameFilter,
  compileV2NameFilter,
} from "../../../../internal/indexer/query/name-filter.js";
import { compareIndexedNames } from "../../../../internal/indexer/query/name-order.js";
import type { NormalizedName } from "../../../../schemas/name.js";
import type { IndexedName } from "../../models/name.js";
import { defaultNameOrder, type NameFilter, type NameOrder } from "../../models/query.js";
import {
  GetSubnamesParameters as GetSubnamesParametersSchema,
  type GetSubnamesError,
  type GetSubnamesParameters,
  type GetSubnamesResult,
} from "./types.js";
import { queryV1Subnames } from "./v1.js";
import { queryV2Subnames } from "./v2.js";

const stateResult = (
  protocol: IndexerProtocol,
  state: Exclude<IndexerSourceState, "enabled">,
): IndexerSourcePageResult<IndexedName, GetSubnamesError> => ({
  status: state,
  metadata: { protocol, status: state },
});

const sourceExhausted = (
  page: IndexerMergeSource<IndexedName> | undefined,
  consumed: string | undefined,
  previous: boolean,
) => {
  if (previous) return true;

  if (page === undefined) return false;

  const last = page.candidates.at(-1)?.position;

  return !page.hasNextPage && (last === undefined || last === consumed);
};

const getSubnamesEffect = Effect.fn("ensforge.getSubnames")(function* (
  config: EnsforgeConfig,
  parameters: GetSubnamesParameters,
): Effect.fn.Return<GetSubnamesResult, GetSubnamesError> {
  if (!config.indexer.enabled) {
    return yield* new IndexerConfigError({
      code: "INDEXER_DISABLED",
      message: "Indexer actions are disabled for this configuration",
    });
  }

  const decoded = yield* Schema.decodeUnknownEffect(GetSubnamesParametersSchema)(parameters).pipe(
    Effect.mapError(
      () =>
        new IndexerFilterError({
          code: "INVALID_FILTER",
          message: "The subname query parameters are invalid",
        }),
    ),
  );

  const parent = yield* Effect.try({
    try: () => normalize(decoded.name) as NormalizedName,
    catch: () =>
      new IndexerFilterError({ code: "INVALID_FILTER", message: "The parent name is invalid" }),
  });

  const filter: NameFilter = decoded.filter ?? {};
  const order: NameOrder = decoded.order ?? defaultNameOrder;
  const pageSize = decoded.pageSize ?? Math.min(20, config.indexer.maximumPageSize);

  if (pageSize > config.indexer.maximumPageSize) {
    return yield* new IndexerFilterError({
      code: "INVALID_FILTER",
      message: `pageSize cannot exceed ${config.indexer.maximumPageSize}`,
    });
  }

  const states = getIndexerRuntimeConfig(config.indexer).sourceStates;

  const compiled = yield* Effect.try({
    try: () => ({
      v1: compileV1NameFilter(filter),
      v2: compileV2NameFilter(filter),
    }),
    catch: (error) => error as IndexerFilterError,
  });

  const binding = makeIndexerCursorBinding(config, "getSubnames", { parent, filter }, order);

  const initial: IndexerCursorPositions = {
    v1: { position: null, exhausted: states.v1 !== "enabled" || compiled.v1.excludesSource },
    v2: { position: null, exhausted: states.v2 !== "enabled" || compiled.v2.excludesSource },
  };

  const positions =
    decoded.cursor === undefined
      ? initial
      : (yield* decodeIndexerCursor(decoded.cursor, binding)).sources;

  const [v1, v2] = yield* Effect.all(
    [
      states.v1 !== "enabled"
        ? Effect.succeed(stateResult("v1", states.v1))
        : positions.v1.exhausted || compiled.v1.excludesSource
          ? Effect.succeed(null)
          : queryV1Subnames(
              config,
              parent,
              compiled.v1.where,
              order,
              pageSize,
              positions.v1.position,
            ),
      states.v2 !== "enabled"
        ? Effect.succeed(stateResult("v2", states.v2))
        : positions.v2.exhausted || compiled.v2.excludesSource
          ? Effect.succeed(null)
          : queryV2Subnames(
              config,
              parent,
              compiled.v2.where,
              filter,
              order,
              pageSize,
              positions.v2.position,
            ),
    ] as const,
    { concurrency: "unbounded" },
  );

  const results = [v1, v2].filter(
    (result): result is IndexerSourcePageResult<IndexedName, GetSubnamesError> => result !== null,
  );

  const collected = yield* collectIndexerSourcePages(results, config.indexer.failureMode);

  const merged = mergeIndexerPages({
    sources: collected.pages,
    limit: pageSize,
    compare: compareIndexedNames(order),
    identity: (name) => name.namehash.toLowerCase(),
    preference: (name, source) => (name.protocol === "v2" ? 3 : source === "v2" ? 2 : 1),
  });

  const pages = new Map(collected.pages.map((page) => [page.protocol, page]));

  const next: IndexerCursorPositions = {
    v1: {
      position: merged.positions.v1 ?? positions.v1.position,
      exhausted: sourceExhausted(pages.get("v1"), merged.positions.v1, positions.v1.exhausted),
    },
    v2: {
      position: merged.positions.v2 ?? positions.v2.position,
      exhausted: sourceExhausted(pages.get("v2"), merged.positions.v2, positions.v2.exhausted),
    },
  };

  const hasNextPage = collected.pages.some((page) => !next[page.protocol].exhausted);

  return {
    items: merged.items,
    pageInfo: {
      cursor: hasNextPage ? yield* encodeIndexerCursor(binding, next) : null,
      hasNextPage,
    },
    sources: collected.sources.map((source) =>
      source.status === "complete"
        ? {
            protocol: source.protocol,
            status: source.status,
            indexedBlock: source.indexedBlock,
            hasNextPage: !next[source.protocol].exhausted,
          }
        : source,
    ),
  };
});

export const getSubnames = defineAction(getSubnamesEffect);

export {
  GetSubnamesParameters,
  GetSubnamesResult,
  type GetSubnamesError,
  type GetSubnamesParameters as GetSubnamesParametersType,
  type GetSubnamesResult as GetSubnamesResultType,
} from "./types.js";
