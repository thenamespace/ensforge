import { Effect, Schema } from "effect";

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
import type { IndexedName } from "../../models/name.js";
import { defaultNameOrder, type NameFilter, type NameOrder } from "../../models/query.js";
import {
  GetNamesParameters as GetNamesParametersSchema,
  type GetNamesError,
  type GetNamesParameters,
  type GetNamesResult,
} from "./types.js";
import { queryV1Names } from "./v1.js";
import { queryV2Names } from "./v2.js";

const sourceStateResult = (
  protocol: IndexerProtocol,
  state: Exclude<IndexerSourceState, "enabled">,
): IndexerSourcePageResult<IndexedName, GetNamesError> => ({
  status: state,
  metadata: { protocol, status: state },
});

const sourceExhausted = (
  page: IndexerMergeSource<IndexedName> | undefined,
  consumedPosition: string | undefined,
  previouslyExhausted: boolean,
): boolean => {
  if (previouslyExhausted) return true;

  if (page === undefined) return false;

  const last = page.candidates.at(-1)?.position;

  return !page.hasNextPage && (last === undefined || last === consumedPosition);
};

const getNamesEffect = Effect.fn("ensforge.getNames")(function* (
  config: EnsforgeConfig,
  parameters: GetNamesParameters,
): Effect.fn.Return<GetNamesResult, GetNamesError> {
  if (!config.indexer.enabled) {
    return yield* new IndexerConfigError({
      code: "INDEXER_DISABLED",
      message: "Indexer actions are disabled for this configuration",
    });
  }

  const decoded = yield* Schema.decodeUnknownEffect(GetNamesParametersSchema)(parameters).pipe(
    Effect.mapError(
      () =>
        new IndexerFilterError({
          code: "INVALID_FILTER",
          message: "The indexed-name query parameters are invalid",
        }),
    ),
  );

  const filter: NameFilter = decoded.filter ?? {};
  const order: NameOrder = decoded.order ?? defaultNameOrder;
  const pageSize = decoded.pageSize ?? Math.min(20, config.indexer.maximumPageSize);

  if (pageSize > config.indexer.maximumPageSize) {
    return yield* new IndexerFilterError({
      code: "INVALID_FILTER",
      message: `pageSize cannot exceed ${config.indexer.maximumPageSize}`,
    });
  }

  const compiled = yield* Effect.try({
    try: () => ({
      v1: compileV1NameFilter(filter),
      v2: compileV2NameFilter(filter),
    }),
    catch: (error) => error as IndexerFilterError,
  });

  const states = getIndexerRuntimeConfig(config.indexer).sourceStates;
  const binding = makeIndexerCursorBinding(config, "getNames", filter, order);

  const initialPositions: IndexerCursorPositions = {
    v1: { position: null, exhausted: states.v1 !== "enabled" || compiled.v1.excludesSource },
    v2: {
      position: null,
      exhausted:
        states.v2 !== "enabled" ||
        compiled.v2.excludesSource ||
        (filter.protocol === "v1" && states.v1 === "enabled" && !compiled.v1.excludesSource),
    },
  };

  const positions =
    decoded.cursor === undefined
      ? initialPositions
      : (yield* decodeIndexerCursor(decoded.cursor, binding)).sources;

  const [v1Result, v2Result] = yield* Effect.all(
    [
      states.v1 !== "enabled"
        ? Effect.succeed(sourceStateResult("v1", states.v1))
        : positions.v1.exhausted || compiled.v1.excludesSource
          ? Effect.succeed(null)
          : queryV1Names(config, compiled.v1.where, order, pageSize, positions.v1.position),
      states.v2 !== "enabled"
        ? Effect.succeed(sourceStateResult("v2", states.v2))
        : positions.v2.exhausted || compiled.v2.excludesSource
          ? Effect.succeed(null)
          : queryV2Names(
              config,
              compiled.v2.where,
              filter,
              compiled.v2.requiresPostFilter,
              order,
              pageSize,
              positions.v2.position,
            ),
    ] as const,
    { concurrency: "unbounded" },
  );

  const results = [v1Result, v2Result].filter(
    (result): result is IndexerSourcePageResult<IndexedName, GetNamesError> => result !== null,
  );

  const collected = yield* collectIndexerSourcePages(results, config.indexer.failureMode);

  const merged = mergeIndexerPages({
    sources: collected.pages,
    limit: pageSize,
    compare: compareIndexedNames(order),
    identity: (name) => name.namehash.toLowerCase(),
    preference: (name, source) => (name.protocol === "v2" ? 3 : source === "v2" ? 2 : 1),
  });

  const pageByProtocol = new Map(collected.pages.map((page) => [page.protocol, page]));

  const nextPositions: IndexerCursorPositions = {
    v1: {
      position: merged.positions.v1 ?? positions.v1.position,
      exhausted: sourceExhausted(
        pageByProtocol.get("v1"),
        merged.positions.v1,
        positions.v1.exhausted,
      ),
    },
    v2: {
      position: merged.positions.v2 ?? positions.v2.position,
      exhausted: sourceExhausted(
        pageByProtocol.get("v2"),
        merged.positions.v2,
        positions.v2.exhausted,
      ),
    },
  };

  const hasNextPage = collected.pages.some((page) => !nextPositions[page.protocol].exhausted);
  const cursor = hasNextPage ? yield* encodeIndexerCursor(binding, nextPositions) : null;

  const sources = collected.sources.map((source) =>
    source.status === "complete"
      ? {
          protocol: source.protocol,
          status: source.status,
          indexedBlock: source.indexedBlock,
          hasNextPage: !nextPositions[source.protocol].exhausted,
        }
      : source,
  );

  return {
    items: merged.items,
    pageInfo: { cursor, hasNextPage },
    sources,
  };
});

export const getNames = defineAction(getNamesEffect);

export {
  GetNamesParameters,
  GetNamesResult,
  type GetNamesError,
  type GetNamesParameters as GetNamesParametersType,
  type GetNamesResult as GetNamesResultType,
} from "./types.js";
