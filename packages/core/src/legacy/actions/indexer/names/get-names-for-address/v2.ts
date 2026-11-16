import { Effect } from "effect";

import type { EnsforgeConfig } from "../../../../config/config.js";
import { IndexerDecodeError } from "../../../../errors/indexer-decode-error.js";
import {
  requestIndexer,
  type IndexerTransportResult,
} from "../../../../internal/indexer/client.js";
import {
  V2GetOwnedNamesDocument,
  type V2GetOwnedNamesQuery,
  type V2GetOwnedNamesQueryVariables,
  V2GetRegistrationsForAddressDocument,
  type V2GetRegistrationsForAddressQuery,
  type V2GetRegistrationsForAddressQueryVariables,
  V2GetResolvedNamesDocument,
  type V2GetResolvedNamesQuery,
  type V2GetResolvedNamesQueryVariables,
  V2GetRolesForAddressDocument,
  type V2GetRolesForAddressQuery,
  type V2GetRolesForAddressQueryVariables,
} from "../../../../internal/indexer/generated/v2/get-names-for-address.js";
import {
  V2GetRelatedNamesDocument,
  type V2GetRelatedNamesQuery,
  type V2GetRelatedNamesQueryVariables,
} from "../../../../internal/indexer/generated/v2/get-related-names.js";
import { normalizeV2IndexerName } from "../../../../internal/indexer/normalize/v2-name.js";
import { matchesNameFilter } from "../../../../internal/indexer/query/name-filter.js";
import { decodeIndexedBlock, requireIndexerData } from "../../../../internal/indexer/response.js";
import type { EthereumAddress } from "../../../../schemas/identity.js";
import type { NameRelation, RelatedIndexedName } from "../../models/name.js";
import type { NameFilter } from "../../models/query.js";
import type { GetNamesForAddressError } from "./types.js";

const relatedOperationName = "V2GetRelatedNames";

// The public V2 endpoint enforces a query-cost ceiling. A full indexed-name
// projection remains comfortably below it at 100 connection nodes.
const batchSize = 100;

type V2Wire = V2GetOwnedNamesQuery["owned"]["edges"][number]["node"];

export const collectV2NamesForAddress = Effect.fn("collectV2NamesForAddress")(function* (
  config: EnsforgeConfig,
  address: EthereumAddress,
  selectedRelations: ReadonlySet<NameRelation>,
  filter: NameFilter,
): Effect.fn.Return<
  { readonly names: ReadonlyArray<RelatedIndexedName>; readonly indexedBlock: bigint },
  GetNamesForAddressError
> {
  const relationMap = new Map<
    string,
    { readonly wire: V2Wire; readonly relations: Set<NameRelation> }
  >();

  const roleNames = new Set<string>();
  const normalizedAddress = address.toLowerCase();
  const includeUnreachable = filter.includeUnreachable === true;
  let indexedBlock = 0n;

  const add = (wire: V2Wire, relation: NameRelation) => {
    const key = wire.id.toLowerCase();
    const existing = relationMap.get(key);

    if (existing === undefined) relationMap.set(key, { wire, relations: new Set([relation]) });
    else existing.relations.add(relation);
  };

  if (
    selectedRelations.has("owner") ||
    selectedRelations.has("manager") ||
    selectedRelations.has("wrapped-owner")
  ) {
    const operationName = "V2GetOwnedNames";
    let after: string | null = null;
    let hasNextPage = true;

    while (hasNextPage) {
      const response: IndexerTransportResult<V2GetOwnedNamesQuery> = yield* requestIndexer<
        V2GetOwnedNamesQuery,
        V2GetOwnedNamesQueryVariables
      >(config, {
        protocol: "v2",
        operationName,
        document: V2GetOwnedNamesDocument,
        variables: { address: normalizedAddress, first: batchSize, after, includeUnreachable },
      });

      const data = yield* requireIndexerData<V2GetOwnedNamesQuery>(
        config,
        "v2",
        operationName,
        response,
      );

      indexedBlock = yield* decodeIndexedBlock(
        config,
        "v2",
        operationName,
        data["_meta"].block.number,
      );

      for (const { node } of data.owned.edges) {
        add(node, "owner");
        add(node, "manager");

        if (node.wrappedOwner?.id.toLowerCase() === normalizedAddress) add(node, "wrapped-owner");
      }

      const next: string | null = data.owned.pageInfo.endCursor;

      if (data.owned.pageInfo.hasNextPage && (next === null || next === after)) {
        return yield* new IndexerDecodeError({
          code: "INVALID_RESPONSE",
          message: "The V2 indexer returned a non-advancing ownership cursor",
          network: config.network,
          protocol: "v2",
          operationName,
          cause: data.owned.pageInfo,
        });
      }

      after = next;
      hasNextPage = data.owned.pageInfo.hasNextPage;
    }
  }

  if (selectedRelations.has("resolved-address")) {
    const operationName = "V2GetResolvedNames";
    let after: string | null = null;
    let hasNextPage = true;

    while (hasNextPage) {
      const response: IndexerTransportResult<V2GetResolvedNamesQuery> = yield* requestIndexer<
        V2GetResolvedNamesQuery,
        V2GetResolvedNamesQueryVariables
      >(config, {
        protocol: "v2",
        operationName,
        document: V2GetResolvedNamesDocument,
        variables: { address: normalizedAddress, first: batchSize, after, includeUnreachable },
      });

      const data = yield* requireIndexerData<V2GetResolvedNamesQuery>(
        config,
        "v2",
        operationName,
        response,
      );

      indexedBlock = yield* decodeIndexedBlock(
        config,
        "v2",
        operationName,
        data["_meta"].block.number,
      );

      for (const { node } of data.resolved.edges) add(node, "resolved-address");

      const next: string | null = data.resolved.pageInfo.endCursor;

      if (data.resolved.pageInfo.hasNextPage && (next === null || next === after)) {
        return yield* new IndexerDecodeError({
          code: "INVALID_RESPONSE",
          message: "The V2 indexer returned a non-advancing resolution cursor",
          network: config.network,
          protocol: "v2",
          operationName,
          cause: data.resolved.pageInfo,
        });
      }

      after = next;
      hasNextPage = data.resolved.pageInfo.hasNextPage;
    }
  }

  if (selectedRelations.has("registrant")) {
    const operationName = "V2GetRegistrationsForAddress";
    let after: string | null = null;
    let hasNextPage = true;

    while (hasNextPage) {
      const response: IndexerTransportResult<V2GetRegistrationsForAddressQuery> =
        yield* requestIndexer<
          V2GetRegistrationsForAddressQuery,
          V2GetRegistrationsForAddressQueryVariables
        >(config, {
          protocol: "v2",
          operationName,
          document: V2GetRegistrationsForAddressDocument,
          variables: { address: normalizedAddress, first: batchSize, after },
        });

      const data = yield* requireIndexerData<V2GetRegistrationsForAddressQuery>(
        config,
        "v2",
        operationName,
        response,
      );

      indexedBlock = yield* decodeIndexedBlock(
        config,
        "v2",
        operationName,
        data["_meta"].block.number,
      );

      for (const { node } of data.registrations.edges) add(node.domain, "registrant");

      const next: string | null = data.registrations.pageInfo.endCursor;

      if (data.registrations.pageInfo.hasNextPage && (next === null || next === after)) {
        return yield* new IndexerDecodeError({
          code: "INVALID_RESPONSE",
          message: "The V2 indexer returned a non-advancing registration cursor",
          network: config.network,
          protocol: "v2",
          operationName,
          cause: data.registrations.pageInfo,
        });
      }

      after = next;
      hasNextPage = data.registrations.pageInfo.hasNextPage;
    }
  }

  if (selectedRelations.has("role-holder")) {
    const operationName = "V2GetRolesForAddress";
    let after: string | null = null;
    let hasNextPage = true;

    while (hasNextPage) {
      const response: IndexerTransportResult<V2GetRolesForAddressQuery> = yield* requestIndexer<
        V2GetRolesForAddressQuery,
        V2GetRolesForAddressQueryVariables
      >(config, {
        protocol: "v2",
        operationName,
        document: V2GetRolesForAddressDocument,
        variables: { address: normalizedAddress, first: batchSize, after },
      });

      const data = yield* requireIndexerData<V2GetRolesForAddressQuery>(
        config,
        "v2",
        operationName,
        response,
      );

      indexedBlock = yield* decodeIndexedBlock(
        config,
        "v2",
        operationName,
        data["_meta"].block.number,
      );

      for (const { node } of data.roles.edges) if (node.name !== null) roleNames.add(node.name);

      const next: string | null = data.roles.pageInfo.endCursor;

      if (data.roles.pageInfo.hasNextPage && (next === null || next === after)) {
        return yield* new IndexerDecodeError({
          code: "INVALID_RESPONSE",
          message: "The V2 indexer returned a non-advancing role cursor",
          network: config.network,
          protocol: "v2",
          operationName,
          cause: data.roles.pageInfo,
        });
      }

      after = next;
      hasNextPage = data.roles.pageInfo.hasNextPage;
    }
  }

  const roleNameList = [...roleNames];

  for (let offset = 0; offset < roleNameList.length; offset += batchSize) {
    const chunk = roleNameList.slice(offset, offset + batchSize);

    const response = yield* requestIndexer<V2GetRelatedNamesQuery, V2GetRelatedNamesQueryVariables>(
      config,
      {
        protocol: "v2",
        operationName: relatedOperationName,
        document: V2GetRelatedNamesDocument,
        variables: { first: chunk.length, names: chunk, includeUnreachable },
      },
    );

    const data = yield* requireIndexerData(config, "v2", relatedOperationName, response);

    for (const wire of data.domains) add(wire, "role-holder");
  }

  const names: Array<RelatedIndexedName> = [];

  for (const { wire, relations } of relationMap.values()) {
    const selected = [...relations].filter((relation) => selectedRelations.has(relation));

    if (selected.length === 0) continue;

    const item = yield* normalizeV2IndexerName(wire, {
      network: config.network,
      protocol: "v2",
      indexedBlock,
      operationName: "V2GetNamesForAddress",
    });

    if (matchesNameFilter(item, filter)) names.push({ ...item, relations: selected });
  }

  return { names, indexedBlock };
});
