import { Effect, Result } from "effect";

import type { EnsforgeConfig } from "../../../../config/config.js";
import { IndexerPaginationError } from "../../../../errors/indexer-pagination-error.js";
import { requestIndexer } from "../../../../internal/indexer/client.js";
import {
  V1GetRegistrationsDocument,
  type Registration_OrderBy,
  type V1GetRegistrationsQuery,
  type V1GetRegistrationsQueryVariables,
} from "../../../../internal/indexer/generated/v1/get-registrations.js";
import { normalizeV1Registration } from "../../../../internal/indexer/normalize/registration.js";
import type { IndexerSourcePageResult } from "../../../../internal/indexer/pagination/merge.js";
import { matchesRegistrationFilter } from "../../../../internal/indexer/query/registration.js";
import {
  decodeIndexedBlock,
  indexerSourceFailure,
  requireIndexerData,
} from "../../../../internal/indexer/response.js";
import type {
  IndexedRegistration,
  RegistrationFilter,
  RegistrationOrder,
} from "../../models/registration.js";
import type { GetRegistrationsError } from "./types.js";

const operationName = "V1GetRegistrations";

const registrationOrderBy = (order: RegistrationOrder): Registration_OrderBy =>
  order.field === "registeredAt"
    ? "registrationDate"
    : order.field === "expiry"
      ? "expiryDate"
      : "labelName";

const decodeOffset = (position: string | null): Effect.Effect<number, IndexerPaginationError> =>
  Effect.try({
    try: () => {
      const offset = position === null ? 0 : Number(position);

      if (!Number.isSafeInteger(offset) || offset < 0) throw new Error("Invalid offset");

      return offset;
    },
    catch: (cause) =>
      new IndexerPaginationError({
        code: "INVALID_CURSOR",
        message: "The V1 registration cursor contains an invalid offset",
        cause,
      }),
  });

export const queryV1Registrations = Effect.fn("queryV1Registrations")(function* (
  config: EnsforgeConfig,
  filter: RegistrationFilter,
  order: RegistrationOrder,
  limit: number,
  position: string | null,
): Effect.fn.Return<
  IndexerSourcePageResult<IndexedRegistration, GetRegistrationsError>,
  IndexerPaginationError
> {
  const initialSkip = yield* decodeOffset(position);

  const result = yield* Effect.gen(function* () {
    const candidates: Array<{ readonly item: IndexedRegistration; readonly position: string }> = [];
    let skip = initialSkip;
    let indexedBlock = 0n;
    let hasNextPage = true;

    while (candidates.length <= limit && hasNextPage) {
      const batchSize = limit + 1;

      const where: V1GetRegistrationsQueryVariables["where"] = {
        ...(filter.registrant === undefined ? {} : { registrant: filter.registrant.toLowerCase() }),
        ...(filter.expiryAfter === undefined
          ? {}
          : { expiryDate_gt: filter.expiryAfter.toString() }),
        ...(filter.expiryBefore === undefined
          ? {}
          : { expiryDate_lt: filter.expiryBefore.toString() }),
      };

      const response = yield* requestIndexer<
        V1GetRegistrationsQuery,
        V1GetRegistrationsQueryVariables
      >(config, {
        protocol: "v1",
        operationName,
        document: V1GetRegistrationsDocument,
        variables: {
          first: batchSize,
          skip,
          where,
          orderBy: registrationOrderBy(order),
          orderDirection: order.direction,
        },
      });

      const data = yield* requireIndexerData(config, "v1", operationName, response);

      indexedBlock = yield* decodeIndexedBlock(
        config,
        "v1",
        operationName,
        data["_meta"]?.block.number,
      );

      const normalized = yield* Effect.all(
        data.registrations.map((registration, index) =>
          normalizeV1Registration(registration, { network: config.network, indexedBlock }).pipe(
            Effect.map((item) => ({ item, position: String(skip + index + 1) })),
          ),
        ),
        { concurrency: "unbounded" },
      );

      candidates.push(...normalized.filter(({ item }) => matchesRegistrationFilter(item, filter)));
      skip += data.registrations.length;
      hasNextPage = data.registrations.length === batchSize;
    }

    return { indexedBlock, page: { protocol: "v1" as const, candidates, hasNextPage } };
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
