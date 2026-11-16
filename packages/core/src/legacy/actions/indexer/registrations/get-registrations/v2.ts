import { Effect, Result } from "effect";

import type { EnsforgeConfig } from "../../../../config/config.js";
import { getIndexerRuntimeConfig } from "../../../../config/indexer-options.js";
import { IndexerDecodeError } from "../../../../errors/indexer-decode-error.js";
import { requestIndexer } from "../../../../internal/indexer/client.js";
import {
  V2GetRegistrationsDocument,
  type Registration_OrderBy,
  type V2GetRegistrationsQuery,
  type V2GetRegistrationsQueryVariables,
} from "../../../../internal/indexer/generated/v2/get-registrations.js";
import { normalizeV2Registration } from "../../../../internal/indexer/normalize/registration.js";
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

const operationName = "V2GetRegistrations";

const registrationOrderBy = (order: RegistrationOrder): Registration_OrderBy =>
  order.field === "registeredAt"
    ? "registrationDate"
    : order.field === "expiry"
      ? "expiryDate"
      : "name";

export const queryV2Registrations = Effect.fn("queryV2Registrations")(function* (
  config: EnsforgeConfig,
  filter: RegistrationFilter,
  order: RegistrationOrder,
  limit: number,
  position: string | null,
): Effect.fn.Return<IndexerSourcePageResult<IndexedRegistration, GetRegistrationsError>> {
  const result = yield* Effect.gen(function* () {
    const candidates: Array<{ readonly item: IndexedRegistration; readonly position: string }> = [];
    let after = position;
    let indexedBlock = 0n;
    let hasNextPage = true;

    while (candidates.length <= limit && hasNextPage) {
      const where: V2GetRegistrationsQueryVariables["where"] = {
        ...(getIndexerRuntimeConfig(config.indexer).sourceStates.v1 === "enabled"
          ? { protocol: "v2" }
          : {}),
        ...(filter.protocols?.length === 1 ? { protocol: filter.protocols[0] } : {}),
        ...(filter.registrant === undefined ? {} : { registrant: filter.registrant.toLowerCase() }),
        ...(filter.expiryAfter === undefined ? {} : { expiryDate_gt: Number(filter.expiryAfter) }),
        ...(filter.expiryBefore === undefined
          ? {}
          : { expiryDate_lt: Number(filter.expiryBefore) }),
      };

      const response = yield* requestIndexer<
        V2GetRegistrationsQuery,
        V2GetRegistrationsQueryVariables
      >(config, {
        protocol: "v2",
        operationName,
        document: V2GetRegistrationsDocument,
        variables: {
          first: Math.max(limit + 1, 25),
          after,
          where,
          orderBy: registrationOrderBy(order),
          orderDirection: order.direction,
        },
      });

      const data = yield* requireIndexerData(config, "v2", operationName, response);

      indexedBlock = yield* decodeIndexedBlock(
        config,
        "v2",
        operationName,
        data["_meta"].block.number,
      );

      const normalized = yield* Effect.all(
        data.registrationConnection.edges.map(({ cursor, node }) =>
          normalizeV2Registration(node, { network: config.network, indexedBlock }).pipe(
            Effect.map((item) => ({ item, position: cursor })),
          ),
        ),
        { concurrency: "unbounded" },
      );

      candidates.push(...normalized.filter(({ item }) => matchesRegistrationFilter(item, filter)));

      const next = data.registrationConnection.pageInfo.endCursor;

      hasNextPage = data.registrationConnection.pageInfo.hasNextPage;

      if (hasNextPage && (next === null || next === after)) {
        return yield* new IndexerDecodeError({
          code: "INVALID_RESPONSE",
          message: "The V2 indexer returned a non-advancing registration cursor",
          network: config.network,
          protocol: "v2",
          operationName,
          cause: data.registrationConnection.pageInfo,
        });
      }

      after = next;
    }

    return { indexedBlock, page: { protocol: "v2" as const, candidates, hasNextPage } };
  }).pipe(Effect.result);

  if (Result.isFailure(result)) {
    return {
      status: "failed",
      error: result.failure,
      metadata: {
        protocol: "v2",
        status: "failed",
        failure: indexerSourceFailure(result.failure),
      },
    };
  }

  return {
    status: "complete",
    page: result.success.page,
    metadata: {
      protocol: "v2",
      status: "complete",
      indexedBlock: result.success.indexedBlock,
      hasNextPage: result.success.page.hasNextPage,
    },
  };
});
