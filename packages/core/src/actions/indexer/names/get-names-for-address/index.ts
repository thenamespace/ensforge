import { Array as Arr, Effect, Order, Result, Schema } from "effect";

import { defineAction } from "../../../../action/action.js";
import type { EnsforgeConfig } from "../../../../config/config.js";
import {
  getIndexerRuntimeConfig,
  type IndexerProtocol,
  type IndexerSourceState,
} from "../../../../config/indexer-options.js";
import { IndexerConfigError } from "../../../../errors/indexer-config-error.js";
import { IndexerFilterError } from "../../../../errors/indexer-filter-error.js";
import { IndexerPaginationError } from "../../../../errors/indexer-pagination-error.js";
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
import { compareIndexedNames } from "../../../../internal/indexer/query/name-order.js";
import { indexerSourceFailure } from "../../../../internal/indexer/response.js";
import type { NameRelation, RelatedIndexedName } from "../../models/name.js";
import { defaultNameOrder, type NameFilter, type NameOrder } from "../../models/query.js";
import {
  defaultAddressRelations,
  GetNamesForAddressParameters as GetNamesForAddressParametersSchema,
  type GetNamesForAddressError,
  type GetNamesForAddressParameters,
  type GetNamesForAddressResult,
} from "./types.js";
import { collectV1NamesForAddress } from "./v1.js";
import { collectV2NamesForAddress } from "./v2.js";

const parseOffset = (position: string | null): Effect.Effect<number, IndexerPaginationError> =>
  Effect.try({
    try: () => {
      const offset = position === null ? 0 : Number(position);

      if (!Number.isSafeInteger(offset) || offset < 0) throw new Error("Invalid offset");

      return offset;
    },
    catch: (cause) =>
      new IndexerPaginationError({
        code: "INVALID_CURSOR",
        message: "The address-discovery cursor contains an invalid position",
        cause,
      }),
  });

const exhausted = (
  page: IndexerMergeSource<RelatedIndexedName> | undefined,
  consumed: string | undefined,
  previous: boolean,
) => previous || (page !== undefined && page.candidates.at(-1)?.position === consumed);

const sourceStateResult = (
  protocol: IndexerProtocol,
  state: Exclude<IndexerSourceState, "enabled">,
): IndexerSourcePageResult<RelatedIndexedName, GetNamesForAddressError> => ({
  status: state,
  metadata: { protocol, status: state },
});

const getNamesForAddressEffect = Effect.fn("ensforge.getNamesForAddress")(function* (
  config: EnsforgeConfig,
  parameters: GetNamesForAddressParameters,
): Effect.fn.Return<GetNamesForAddressResult, GetNamesForAddressError> {
  if (!config.indexer.enabled) {
    return yield* new IndexerConfigError({
      code: "INDEXER_DISABLED",
      message: "Indexer actions are disabled for this configuration",
    });
  }

  const decoded = yield* Schema.decodeUnknownEffect(GetNamesForAddressParametersSchema)(
    parameters,
  ).pipe(
    Effect.mapError(
      () =>
        new IndexerFilterError({
          code: "INVALID_FILTER",
          message: "The address-discovery parameters are invalid",
        }),
    ),
  );

  const relations = decoded.relations ?? defaultAddressRelations;

  if (relations.length === 0) {
    return yield* new IndexerFilterError({
      code: "INVALID_FILTER",
      message: "At least one address relation is required",
    });
  }

  const selectedRelations = new Set<NameRelation>(relations);
  const v1Relevant = relations.some((relation) => relation !== "role-holder");
  const v2Relevant = relations.some((relation) => relation !== "registry-owner");
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

  const binding = makeIndexerCursorBinding(
    config,
    "getNamesForAddress",
    { address: decoded.address, relations: [...relations], filter },
    order,
  );

  const initial: IndexerCursorPositions = {
    v1: {
      position: null,
      exhausted: states.v1 !== "enabled" || filter.protocol === "v2" || !v1Relevant,
    },
    v2: { position: null, exhausted: states.v2 !== "enabled" || !v2Relevant },
  };

  const positions =
    decoded.cursor === undefined
      ? initial
      : (yield* decodeIndexerCursor(decoded.cursor, binding)).sources;

  const [v1Offset, v2Offset] = yield* Effect.all([
    parseOffset(positions.v1.position),
    parseOffset(positions.v2.position),
  ] as const);

  const collect = <
    A extends { readonly names: ReadonlyArray<RelatedIndexedName>; readonly indexedBlock: bigint },
  >(
    protocol: IndexerProtocol,
    effect: Effect.Effect<A, GetNamesForAddressError>,
    offset: number,
  ) =>
    Effect.result(effect).pipe(
      Effect.map((result): IndexerSourcePageResult<RelatedIndexedName, GetNamesForAddressError> => {
        if (Result.isFailure(result)) {
          return {
            status: "failed",
            error: result.failure,
            metadata: {
              protocol,
              status: "failed",
              failure: indexerSourceFailure(result.failure),
            },
          };
        }

        const names = Arr.sort(
          result.success.names,
          Order.make<RelatedIndexedName>((left, right) => {
            const compared = compareIndexedNames(order)(left, right);

            return compared < 0 ? -1 : compared > 0 ? 1 : 0;
          }),
        );

        return {
          status: "complete",
          page: {
            protocol,
            candidates: names.slice(offset).map((item, index) => ({
              item,
              position: String(offset + index + 1),
            })),
            hasNextPage: false,
          },
          metadata: {
            protocol,
            status: "complete",
            indexedBlock: result.success.indexedBlock,
            hasNextPage: offset < names.length,
          },
        };
      }),
    );

  const effects = [
    ...(states.v1 !== "enabled"
      ? [Effect.succeed(sourceStateResult("v1", states.v1))]
      : !positions.v1.exhausted
        ? [
            collect(
              "v1",
              collectV1NamesForAddress(config, decoded.address, selectedRelations, filter),
              v1Offset,
            ),
          ]
        : []),
    ...(states.v2 !== "enabled"
      ? [Effect.succeed(sourceStateResult("v2", states.v2))]
      : !positions.v2.exhausted
        ? [
            collect(
              "v2",
              collectV2NamesForAddress(config, decoded.address, selectedRelations, filter),
              v2Offset,
            ),
          ]
        : []),
  ];

  const results = yield* Effect.all(effects, { concurrency: "unbounded" });
  const collected = yield* collectIndexerSourcePages(results, config.indexer.failureMode);

  const allRelations = new Map<string, Set<NameRelation>>();

  for (const page of collected.pages) {
    for (const { item } of page.candidates) {
      const key = item.namehash.toLowerCase();
      const current = allRelations.get(key) ?? new Set<NameRelation>();

      for (const relation of item.relations) current.add(relation);

      allRelations.set(key, current);
    }
  }

  const pages = collected.pages.map((page) => ({
    ...page,
    candidates: page.candidates.map((candidate) => ({
      ...candidate,
      item: {
        ...candidate.item,
        relations: [...(allRelations.get(candidate.item.namehash.toLowerCase()) ?? [])],
      },
    })),
  }));

  const merged = mergeIndexerPages({
    sources: pages,
    limit: pageSize,
    compare: compareIndexedNames(order),
    identity: (name) => name.namehash.toLowerCase(),
    preference: (name, source) => (name.protocol === "v2" ? 3 : source === "v2" ? 2 : 1),
  });

  const pageByProtocol = new Map(pages.map((page) => [page.protocol, page]));

  const next: IndexerCursorPositions = {
    v1: {
      position: merged.positions.v1 ?? positions.v1.position,
      exhausted: exhausted(pageByProtocol.get("v1"), merged.positions.v1, positions.v1.exhausted),
    },
    v2: {
      position: merged.positions.v2 ?? positions.v2.position,
      exhausted: exhausted(pageByProtocol.get("v2"), merged.positions.v2, positions.v2.exhausted),
    },
  };

  const hasNextPage = pages.some((page) => !next[page.protocol].exhausted);
  const cursor = hasNextPage ? yield* encodeIndexerCursor(binding, next) : null;

  return {
    items: merged.items,
    pageInfo: { cursor, hasNextPage },
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

export const getNamesForAddress = defineAction(getNamesForAddressEffect);

export {
  GetNamesForAddressParameters,
  GetNamesForAddressResult,
  defaultAddressRelations,
  type GetNamesForAddressError,
  type GetNamesForAddressParameters as GetNamesForAddressParametersType,
  type GetNamesForAddressResult as GetNamesForAddressResultType,
} from "./types.js";
