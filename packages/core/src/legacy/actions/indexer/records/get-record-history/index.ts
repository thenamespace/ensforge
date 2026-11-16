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
import { decodeIndexerNameIdentity } from "../../../../internal/indexer/name-identity.js";
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
import type { IndexedRecordEvent } from "../../models/record.js";
import { defaultRecordHistoryOrder } from "../../models/record.js";
import {
  GetRecordHistoryParameters as GetRecordHistoryParametersSchema,
  type GetRecordHistoryError,
  type GetRecordHistoryParameters,
  type GetRecordHistoryResult,
} from "./types.js";
import { queryV1RecordHistory } from "./v1.js";
import { queryV2RecordHistory } from "./v2.js";

const sourceStateResult = (
  protocol: IndexerProtocol,
  state: Exclude<IndexerSourceState, "enabled">,
): IndexerSourcePageResult<IndexedRecordEvent, GetRecordHistoryError> => ({
  status: state,
  metadata: { protocol, status: state },
});

const sourceExhausted = (
  page: IndexerMergeSource<IndexedRecordEvent> | undefined,
  consumedPosition: string | undefined,
  previouslyExhausted: boolean,
): boolean => {
  if (previouslyExhausted) return true;

  if (page === undefined) return false;

  const last = page.candidates.at(-1)?.position;

  return !page.hasNextPage && (last === undefined || last === consumedPosition);
};

const compareEvents =
  (direction: "asc" | "desc") =>
  (left: IndexedRecordEvent, right: IndexedRecordEvent): number => {
    const block =
      left.blockNumber < right.blockNumber ? -1 : left.blockNumber > right.blockNumber ? 1 : 0;

    const orderedBlock = direction === "asc" ? block : -block;

    if (orderedBlock !== 0) return orderedBlock;

    const id = left.id.localeCompare(right.id);

    return direction === "asc" ? id : -id;
  };

const getRecordHistoryEffect = Effect.fn("ensforge.getRecordHistory")(function* (
  config: EnsforgeConfig,
  parameters: GetRecordHistoryParameters,
): Effect.fn.Return<GetRecordHistoryResult, GetRecordHistoryError> {
  if (!config.indexer.enabled) {
    return yield* new IndexerConfigError({
      code: "INDEXER_DISABLED",
      message: "Indexer actions are disabled for this configuration",
    });
  }

  const decoded = yield* Schema.decodeUnknownEffect(GetRecordHistoryParametersSchema)(
    parameters,
  ).pipe(
    Effect.mapError(
      () =>
        new IndexerFilterError({
          code: "INVALID_FILTER",
          message: "The record-history query parameters are invalid",
        }),
    ),
  );

  const lookup = yield* decodeIndexerNameIdentity(decoded);
  const filter = decoded.filter ?? {};
  const order = decoded.order ?? defaultRecordHistoryOrder;
  const pageSize = decoded.pageSize ?? Math.min(20, config.indexer.maximumPageSize);

  if (pageSize > config.indexer.maximumPageSize) {
    return yield* new IndexerFilterError({
      code: "INVALID_FILTER",
      message: `pageSize cannot exceed ${config.indexer.maximumPageSize}`,
    });
  }

  const graphNumbers = [
    filter.blockAfter,
    filter.blockBefore,
    filter.timestampAfter,
    filter.timestampBefore,
  ].filter((value): value is bigint => value !== undefined);

  if (graphNumbers.some((value) => value > 2_147_483_647n)) {
    return yield* new IndexerFilterError({
      code: "INVALID_FILTER",
      message: "Block and timestamp filters must fit the indexer's GraphQL Int range",
    });
  }

  const states = getIndexerRuntimeConfig(config.indexer).sourceStates;
  const v1Excluded = filter.timestampAfter !== undefined || filter.timestampBefore !== undefined;

  const binding = makeIndexerCursorBinding(
    config,
    "getRecordHistory",
    { ...filter, namehash: lookup.namehash },
    order,
  );

  const initialPositions: IndexerCursorPositions = {
    v1: { position: null, exhausted: states.v1 !== "enabled" || v1Excluded },
    v2: { position: null, exhausted: states.v2 !== "enabled" },
  };

  const positions =
    decoded.cursor === undefined
      ? initialPositions
      : (yield* decodeIndexerCursor(decoded.cursor, binding)).sources;

  const [v1Result, v2Result] = yield* Effect.all(
    [
      states.v1 !== "enabled"
        ? Effect.succeed(sourceStateResult("v1", states.v1))
        : positions.v1.exhausted
          ? Effect.succeed(null)
          : queryV1RecordHistory(
              config,
              lookup.namehash,
              filter,
              order,
              pageSize,
              positions.v1.position,
            ),
      states.v2 !== "enabled"
        ? Effect.succeed(sourceStateResult("v2", states.v2))
        : positions.v2.exhausted
          ? Effect.succeed(null)
          : queryV2RecordHistory(
              config,
              lookup.namehash,
              filter,
              order,
              pageSize,
              positions.v2.position,
              states.v1 === "enabled",
            ),
    ] as const,
    { concurrency: "unbounded" },
  );

  const results = [v1Result, v2Result].filter(
    (result): result is IndexerSourcePageResult<IndexedRecordEvent, GetRecordHistoryError> =>
      result !== null,
  );

  const collected = yield* collectIndexerSourcePages(results, config.indexer.failureMode);

  const merged = mergeIndexerPages({
    sources: collected.pages,
    limit: pageSize,
    compare: compareEvents(order.direction),
    identity: (event) => `${event.source.protocol}:${event.id}`,
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

  return { items: merged.items, pageInfo: { cursor, hasNextPage }, sources };
});

export const getRecordHistory = defineAction(getRecordHistoryEffect);

export {
  GetRecordHistoryParameters,
  GetRecordHistoryResult,
  type GetRecordHistoryError,
  type GetRecordHistoryParameters as GetRecordHistoryParametersType,
  type GetRecordHistoryResult as GetRecordHistoryResultType,
} from "./types.js";
