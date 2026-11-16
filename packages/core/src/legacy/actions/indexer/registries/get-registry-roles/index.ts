import { Effect, Schema } from "effect";

import { getAddress } from "viem";
import { normalize } from "viem/ens";

import { defineAction } from "../../../../action/action.js";
import type { EnsforgeConfig } from "../../../../config/config.js";
import { IndexerConfigError } from "../../../../errors/indexer-config-error.js";
import { IndexerDecodeError } from "../../../../errors/indexer-decode-error.js";
import { IndexerFilterError } from "../../../../errors/indexer-filter-error.js";
import { requestIndexer } from "../../../../internal/indexer/client.js";
import {
  V2GetRegistryRolesDocument,
  type V2GetRegistryRolesQuery,
  type V2GetRegistryRolesQueryVariables,
} from "../../../../internal/indexer/generated/v2/get-registry-roles.js";
import { normalizeV2RegistryRole } from "../../../../internal/indexer/normalize/registry.js";
import {
  decodeIndexerCursor,
  encodeIndexerCursor,
  makeIndexerCursorBinding,
} from "../../../../internal/indexer/pagination/cursor.js";
import { decodeIndexedBlock, requireIndexerData } from "../../../../internal/indexer/response.js";
import { getV2IndexerUnsupported } from "../../../../internal/indexer/v2-support.js";
import type { RegistryRoleFilter } from "../../models/registry.js";
import {
  GetRegistryRolesParameters as GetRegistryRolesParametersSchema,
  type GetRegistryRolesError,
  type GetRegistryRolesParameters,
  type GetRegistryRolesResult,
} from "./types.js";

const matchesRoleFilter = (
  role: {
    readonly account: string;
    readonly resource: string;
    readonly name: string | null;
    readonly bitmap: string;
    readonly permissions: ReadonlyArray<string>;
    readonly active: boolean;
    readonly blockNumber: bigint;
    readonly timestamp: bigint;
  },
  filter: RegistryRoleFilter,
) =>
  (filter.account === undefined || role.account.toLowerCase() === filter.account.toLowerCase()) &&
  (filter.resource === undefined ||
    role.resource.toLowerCase() === filter.resource.toLowerCase()) &&
  (filter.name === undefined || role.name === filter.name) &&
  (filter.bitmap === undefined || role.bitmap.toLowerCase() === filter.bitmap.toLowerCase()) &&
  (filter.permission === undefined || role.permissions.includes(filter.permission)) &&
  (filter.active === undefined || role.active === filter.active) &&
  (filter.blockAfter === undefined || role.blockNumber > filter.blockAfter) &&
  (filter.blockBefore === undefined || role.blockNumber < filter.blockBefore) &&
  (filter.timestampAfter === undefined || role.timestamp > filter.timestampAfter) &&
  (filter.timestampBefore === undefined || role.timestamp < filter.timestampBefore);

const getRegistryRolesEffect = Effect.fn("ensforge.getRegistryRoles")(function* (
  config: EnsforgeConfig,
  parameters: GetRegistryRolesParameters,
): Effect.fn.Return<GetRegistryRolesResult, GetRegistryRolesError> {
  if (!config.indexer.enabled) {
    return yield* new IndexerConfigError({
      code: "INDEXER_DISABLED",
      message: "Indexer actions are disabled for this configuration",
    });
  }

  const decoded = yield* Schema.decodeUnknownEffect(GetRegistryRolesParametersSchema)(
    parameters,
  ).pipe(
    Effect.mapError(
      () =>
        new IndexerFilterError({
          code: "INVALID_FILTER",
          message: "The registry role query parameters are invalid",
        }),
    ),
  );

  const unsupported = getV2IndexerUnsupported(config);

  if (unsupported !== null) return unsupported;

  const registry = getAddress(decoded.registry);

  const filter = yield* Effect.try({
    try: (): RegistryRoleFilter => ({
      ...decoded.filter,
      ...(decoded.filter?.account !== undefined && {
        account: getAddress(decoded.filter.account),
      }),
      ...(decoded.filter?.name !== undefined && { name: normalize(decoded.filter.name) }),
    }),
    catch: () =>
      new IndexerFilterError({
        code: "INVALID_FILTER",
        message: "The registry role filter is invalid",
      }),
  });

  const pageSize = decoded.pageSize ?? Math.min(20, config.indexer.maximumPageSize);

  if (pageSize > config.indexer.maximumPageSize) {
    return yield* new IndexerFilterError({
      code: "INVALID_FILTER",
      message: `pageSize cannot exceed ${config.indexer.maximumPageSize}`,
    });
  }

  const binding = makeIndexerCursorBinding(config, "getRegistryRoles", { registry, filter }, null);

  const positions =
    decoded.cursor === undefined
      ? { v1: { position: null, exhausted: true }, v2: { position: null, exhausted: false } }
      : (yield* decodeIndexerCursor(decoded.cursor, binding)).sources;

  let after = positions.v2.position;
  let indexedBlock = 0n;
  let hasNextPage = true;

  const items: Array<
    Extract<GetRegistryRolesResult, { status: "supported" }>["value"]["items"][number]
  > = [];

  const operationName = "V2GetRegistryRoles";
  const requestSize = Math.min(Math.max(pageSize * 2, 20), config.indexer.maximumPageSize);

  while (hasNextPage && items.length < pageSize) {
    const requestAfter = after;

    const response = yield* requestIndexer<
      V2GetRegistryRolesQuery,
      V2GetRegistryRolesQueryVariables
    >(config, {
      protocol: "v2",
      operationName,
      document: V2GetRegistryRolesDocument,
      variables: {
        registry: registry.toLowerCase(),
        account: filter.account?.toLowerCase() ?? null,
        resource: filter.resource?.toLowerCase() ?? null,
        first: requestSize,
        after,
      },
    });

    const data = yield* requireIndexerData(config, "v2", operationName, response);

    indexedBlock = yield* decodeIndexedBlock(
      config,
      "v2",
      operationName,
      data["_meta"].block.number,
    );

    const connection = data.roleConnection;

    hasNextPage = connection.pageInfo.hasNextPage;

    for (const { cursor, node } of connection.edges) {
      after = cursor;

      const role = yield* normalizeV2RegistryRole(registry, node, {
        network: config.network,
        protocol: "v2",
        indexedBlock,
        operationName,
      });

      if (matchesRoleFilter(role, filter)) items.push(role);

      if (items.length === pageSize) {
        hasNextPage = cursor !== connection.edges.at(-1)?.cursor || connection.pageInfo.hasNextPage;

        break;
      }
    }

    const next = connection.pageInfo.endCursor;

    if (items.length < pageSize && connection.pageInfo.hasNextPage) {
      if (next === null || next === requestAfter) {
        return yield* new IndexerDecodeError({
          code: "INVALID_RESPONSE",
          message: "The V2 indexer returned a non-advancing registry-role cursor",
          network: config.network,
          protocol: "v2",
          operationName,
          cause: connection.pageInfo,
        });
      }

      after = next;
    }
  }

  const cursor = hasNextPage
    ? yield* encodeIndexerCursor(binding, {
        v1: { position: null, exhausted: true },
        v2: { position: after, exhausted: false },
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

export const getRegistryRoles = defineAction(getRegistryRolesEffect);

export {
  GetRegistryRolesPage,
  GetRegistryRolesParameters,
  GetRegistryRolesResult,
  type GetRegistryRolesError,
  type GetRegistryRolesPage as GetRegistryRolesPageType,
  type GetRegistryRolesParameters as GetRegistryRolesParametersType,
  type GetRegistryRolesResult as GetRegistryRolesResultType,
} from "./types.js";
