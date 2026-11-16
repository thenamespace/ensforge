import { Array as Arr, Effect, Order, Result, Schema } from "effect";

import { namehash as makeNamehash } from "viem/ens";

import type { EnsforgeConfig } from "../../../../config/config.js";
import { IndexerDecodeError } from "../../../../errors/indexer-decode-error.js";
import { IndexerPaginationError } from "../../../../errors/indexer-pagination-error.js";
import { requestIndexer } from "../../../../internal/indexer/client.js";
import {
  V1GetEventsDocument,
  type V1GetEventsQuery,
  type V1GetEventsQueryVariables,
} from "../../../../internal/indexer/generated/v1/get-events.js";
import {
  normalizeV1DomainEvent,
  normalizeV1RegistrationEvent,
  normalizeV1ResolverEvent,
} from "../../../../internal/indexer/normalize/event.js";
import type { IndexerSourcePageResult } from "../../../../internal/indexer/pagination/merge.js";
import { compareEvents, matchesEventFilter } from "../../../../internal/indexer/query/event.js";
import {
  decodeIndexedBlock,
  indexerSourceFailure,
  requireIndexerData,
} from "../../../../internal/indexer/response.js";
import type {
  EventFilter,
  EventOrder,
  IndexedEvent,
  IndexedEventKind,
} from "../../models/event.js";
import type { GetEventsError } from "./types.js";

const operationName = "V1GetEvents";

const Position = Schema.Struct({
  domain: Schema.Int.pipe(Schema.check(Schema.isGreaterThanOrEqualTo(0))),
  registration: Schema.Int.pipe(Schema.check(Schema.isGreaterThanOrEqualTo(0))),
  resolver: Schema.Int.pipe(Schema.check(Schema.isGreaterThanOrEqualTo(0))),
});
type Position = typeof Position.Type;

type Category = keyof Position;

const domainKinds = new Set<IndexedEventKind>([
  "transfer",
  "resolver",
  "ttl",
  "wrap",
  "unwrap",
  "fuses",
  "expiry",
]);

const registrationKinds = new Set<IndexedEventKind>(["registration", "renewal", "transfer"]);

const resolverKinds = new Set<IndexedEventKind>(["record"]);

const includesCategory = (filter: EventFilter, kinds: ReadonlySet<IndexedEventKind>) =>
  filter.kinds === undefined || filter.kinds.some((kind) => kinds.has(kind));

export const v1SupportsEventFilter = (filter: EventFilter): boolean =>
  filter.contractAddress === undefined &&
  filter.timestampAfter === undefined &&
  filter.timestampBefore === undefined &&
  (includesCategory(filter, domainKinds) ||
    includesCategory(filter, registrationKinds) ||
    includesCategory(filter, resolverKinds));

const decodePosition = (position: string | null): Effect.Effect<Position, IndexerPaginationError> =>
  position === null
    ? Effect.succeed({ domain: 0, registration: 0, resolver: 0 })
    : Effect.try({
        try: () => Schema.decodeUnknownSync(Position)(JSON.parse(position)),
        catch: (cause) =>
          new IndexerPaginationError({
            code: "INVALID_CURSOR",
            message: "The V1 event cursor contains an invalid position",
            cause,
          }),
      });

const encodePosition = (position: Position): string => JSON.stringify(position);

export const queryV1Events = Effect.fn("queryV1Events")(function* (
  config: EnsforgeConfig,
  filter: EventFilter,
  order: EventOrder,
  limit: number,
  position: string | null,
): Effect.fn.Return<IndexerSourcePageResult<IndexedEvent, GetEventsError>, IndexerPaginationError> {
  let offsets = yield* decodePosition(position);

  const result = yield* Effect.gen(function* () {
    const candidates: Array<{ readonly item: IndexedEvent; readonly position: string }> = [];
    let indexedBlock = 0n;
    let hasNextPage = true;
    const domainEnabled = includesCategory(filter, domainKinds);
    const registrationEnabled = includesCategory(filter, registrationKinds);
    const resolverEnabled = includesCategory(filter, resolverKinds);

    while (candidates.length <= limit && hasNextPage) {
      const batchSize = limit + 1;

      const namehash =
        filter.namehash ?? (filter.name === undefined ? undefined : makeNamehash(filter.name));

      const blockWhere = {
        ...(filter.blockAfter === undefined ? {} : { blockNumber_gt: Number(filter.blockAfter) }),
        ...(filter.blockBefore === undefined ? {} : { blockNumber_lt: Number(filter.blockBefore) }),
      };

      const variables: V1GetEventsQueryVariables = {
        domainFirst: domainEnabled ? batchSize : 1,
        registrationFirst: registrationEnabled ? batchSize : 1,
        resolverFirst: resolverEnabled ? batchSize : 1,
        domainSkip: offsets.domain,
        registrationSkip: offsets.registration,
        resolverSkip: offsets.resolver,
        domainWhere: {
          ...blockWhere,
          ...(namehash === undefined ? {} : { domain: namehash }),
        },
        registrationWhere: {
          ...blockWhere,
          ...(namehash === undefined ? {} : { registration_: { domain: namehash } }),
        },
        resolverWhere: {
          ...blockWhere,
          ...(namehash === undefined ? {} : { resolver_: { domain: namehash } }),
        },
        orderDirection: order.direction,
      };

      const response = yield* requestIndexer<V1GetEventsQuery, V1GetEventsQueryVariables>(config, {
        protocol: "v1",
        operationName,
        document: V1GetEventsDocument,
        variables,
      });

      const data = yield* requireIndexerData(config, "v1", operationName, response);

      indexedBlock = yield* decodeIndexedBlock(
        config,
        "v1",
        operationName,
        data["_meta"]?.block.number,
      );

      const normalized = yield* Effect.try({
        try: () => {
          const entries: Array<{ readonly category: Category; readonly item: IndexedEvent }> = [
            ...(domainEnabled
              ? data.domainEvents.map((event) => ({
                  category: "domain" as const,
                  item: normalizeV1DomainEvent(event, { network: config.network, indexedBlock }),
                }))
              : []),
            ...(registrationEnabled
              ? data.registrationEvents.map((event) => ({
                  category: "registration" as const,
                  item: normalizeV1RegistrationEvent(event, {
                    network: config.network,
                    indexedBlock,
                  }),
                }))
              : []),
            ...(resolverEnabled
              ? data.resolverEvents.map((event) => ({
                  category: "resolver" as const,
                  item: normalizeV1ResolverEvent(event, { network: config.network, indexedBlock }),
                }))
              : []),
          ];

          return Arr.sort(
            entries,
            Order.make<{ readonly category: Category; readonly item: IndexedEvent }>(
              (left, right) => {
                const compared = compareEvents(order)(left.item, right.item);

                return compared < 0 ? -1 : compared > 0 ? 1 : 0;
              },
            ),
          );
        },
        catch: (cause) =>
          new IndexerDecodeError({
            code: "INVALID_RESPONSE",
            message: "Unable to decode V1 event history",
            network: config.network,
            protocol: "v1",
            operationName,
            cause,
          }),
      });

      const nextOffsets: { domain: number; registration: number; resolver: number } = {
        domain: offsets.domain,
        registration: offsets.registration,
        resolver: offsets.resolver,
      };

      for (const entry of normalized) {
        const category: Category = entry.category;

        nextOffsets[category] += 1;

        if (matchesEventFilter(entry.item, filter)) {
          candidates.push({ item: entry.item, position: encodePosition(nextOffsets) });
        }
      }

      offsets = nextOffsets;
      hasNextPage =
        (domainEnabled && data.domainEvents.length === batchSize) ||
        (registrationEnabled && data.registrationEvents.length === batchSize) ||
        (resolverEnabled && data.resolverEvents.length === batchSize);
    }

    return {
      indexedBlock,
      page: {
        protocol: "v1" as const,
        candidates,
        hasNextPage: candidates.length > limit || hasNextPage,
      },
    };
  }).pipe(Effect.result);

  if (Result.isFailure(result)) {
    return {
      status: "failed",
      error: result.failure,
      metadata: {
        protocol: "v1",
        status: "failed",
        failure: indexerSourceFailure(result.failure),
      },
    };
  }

  return {
    status: "complete",
    page: result.success.page,
    metadata: {
      protocol: "v1",
      status: "complete",
      indexedBlock: result.success.indexedBlock,
      hasNextPage: result.success.page.hasNextPage,
    },
  };
});
