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
  compareRegistrations,
  validateRegistrationFilter,
} from "../../../../internal/indexer/query/registration.js";
import type { IndexedRegistration } from "../../models/registration.js";
import {
  defaultRegistrationOrder,
  type RegistrationFilter,
  type RegistrationOrder,
} from "../../models/registration.js";
import {
  GetRegistrationsParameters as GetRegistrationsParametersSchema,
  type GetRegistrationsError,
  type GetRegistrationsParameters,
  type GetRegistrationsResult,
} from "./types.js";
import { queryV1Registrations } from "./v1.js";
import { queryV2Registrations } from "./v2.js";

const sourceStateResult = (
  protocol: IndexerProtocol,
  state: Exclude<IndexerSourceState, "enabled">,
): IndexerSourcePageResult<IndexedRegistration, GetRegistrationsError> => ({
  status: state,
  metadata: { protocol, status: state },
});

const sourceExhausted = (
  page: IndexerMergeSource<IndexedRegistration> | undefined,
  consumedPosition: string | undefined,
  previouslyExhausted: boolean,
): boolean => {
  if (previouslyExhausted) return true;

  if (page === undefined) return false;

  const last = page.candidates.at(-1)?.position;

  return !page.hasNextPage && (last === undefined || last === consumedPosition);
};

export const getRegistrationsEffect = Effect.fn("ensforge.getRegistrations")(function* (
  config: EnsforgeConfig,
  parameters: GetRegistrationsParameters,
): Effect.fn.Return<GetRegistrationsResult, GetRegistrationsError> {
  if (!config.indexer.enabled) {
    return yield* new IndexerConfigError({
      code: "INDEXER_DISABLED",
      message: "Indexer actions are disabled for this configuration",
    });
  }

  const decoded = yield* Schema.decodeUnknownEffect(GetRegistrationsParametersSchema)(
    parameters,
  ).pipe(
    Effect.mapError(
      () =>
        new IndexerFilterError({
          code: "INVALID_FILTER",
          message: "The registration query parameters are invalid",
        }),
    ),
  );

  const filter = yield* Effect.try({
    try: (): RegistrationFilter => {
      validateRegistrationFilter(decoded.filter ?? {});

      return decoded.filter ?? {};
    },
    catch: (cause) =>
      cause instanceof IndexerFilterError
        ? cause
        : new IndexerFilterError({
            code: "INVALID_FILTER",
            message: "The registration filter is invalid",
          }),
  });

  const order: RegistrationOrder = decoded.order ?? defaultRegistrationOrder;
  const pageSize = decoded.pageSize ?? Math.min(20, config.indexer.maximumPageSize);

  if (pageSize > config.indexer.maximumPageSize) {
    return yield* new IndexerFilterError({
      code: "INVALID_FILTER",
      message: `pageSize cannot exceed ${config.indexer.maximumPageSize}`,
    });
  }

  const graphNumbers = [filter.expiryAfter, filter.expiryBefore].filter(
    (value): value is bigint => value !== undefined,
  );

  if (graphNumbers.some((value) => value > 2_147_483_647n)) {
    return yield* new IndexerFilterError({
      code: "INVALID_FILTER",
      message: "Registration time filters must fit the indexer's GraphQL Int range",
    });
  }

  const states = getIndexerRuntimeConfig(config.indexer).sourceStates;
  const includesV1 = filter.protocols?.includes("v1") ?? true;
  const includesV2 = filter.protocols?.includes("v2") ?? true;
  const v2CanServeV1 = states.v1 !== "enabled";
  const binding = makeIndexerCursorBinding(config, "getRegistrations", filter, order);

  const initialPositions: IndexerCursorPositions = {
    v1: { position: null, exhausted: states.v1 !== "enabled" || !includesV1 },
    v2: {
      position: null,
      exhausted: states.v2 !== "enabled" || (!includesV2 && !(v2CanServeV1 && includesV1)),
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
        : positions.v1.exhausted
          ? Effect.succeed(null)
          : queryV1Registrations(config, filter, order, pageSize, positions.v1.position),
      states.v2 !== "enabled"
        ? Effect.succeed(sourceStateResult("v2", states.v2))
        : positions.v2.exhausted
          ? Effect.succeed(null)
          : queryV2Registrations(config, filter, order, pageSize, positions.v2.position),
    ] as const,
    { concurrency: "unbounded" },
  );

  const results = [v1Result, v2Result].filter(
    (result): result is IndexerSourcePageResult<IndexedRegistration, GetRegistrationsError> =>
      result !== null,
  );

  const collected = yield* collectIndexerSourcePages(results, config.indexer.failureMode);

  const merged = mergeIndexerPages({
    sources: collected.pages,
    limit: pageSize,
    compare: compareRegistrations(order),
    identity: (registration) => `${registration.protocol}:${registration.id}`,
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

export const getRegistrations = defineAction(getRegistrationsEffect);

export {
  GetRegistrationsParameters,
  GetRegistrationsResult,
  type GetRegistrationsError,
  type GetRegistrationsParameters as GetRegistrationsParametersType,
  type GetRegistrationsResult as GetRegistrationsResultType,
} from "./types.js";
