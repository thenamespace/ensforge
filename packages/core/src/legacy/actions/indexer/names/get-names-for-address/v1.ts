import { Effect } from "effect";

import type { EnsforgeConfig } from "../../../../config/config.js";
import { requestIndexer } from "../../../../internal/indexer/client.js";
import {
  V1GetNamesForAddressDocument,
  type V1GetNamesForAddressQuery,
  type V1GetNamesForAddressQueryVariables,
} from "../../../../internal/indexer/generated/v1/get-names-for-address.js";
import {
  normalizeV1IndexedName,
  type V1IndexedNameWire,
} from "../../../../internal/indexer/normalize/v1-name.js";
import { matchesNameFilter } from "../../../../internal/indexer/query/name-filter.js";
import { decodeIndexedBlock, requireIndexerData } from "../../../../internal/indexer/response.js";
import type { EthereumAddress } from "../../../../schemas/identity.js";
import type { NameRelation, RelatedIndexedName } from "../../models/name.js";
import type { NameFilter } from "../../models/query.js";
import type { GetNamesForAddressError } from "./types.js";

const operationName = "V1GetNamesForAddress";

const batchSize = 500;

const addressEquals = (value: unknown, address: string) =>
  typeof value === "string" && value.toLowerCase() === address;

const relationsFor = (wire: V1IndexedNameWire, address: string): ReadonlyArray<NameRelation> => {
  const relations: Array<NameRelation> = [];
  const wrappedOwner = wire.wrappedDomain?.owner.id ?? wire.wrappedOwner?.id;
  const effectiveOwner = wrappedOwner ?? wire.owner.id;

  if (addressEquals(effectiveOwner, address)) relations.push("owner", "manager");

  if (addressEquals(wire.owner.id, address)) relations.push("registry-owner");

  if (addressEquals(wire.registrant?.id, address)) relations.push("registrant");

  if (addressEquals(wrappedOwner, address)) relations.push("wrapped-owner");

  if (addressEquals(wire.resolvedAddress?.id, address)) relations.push("resolved-address");

  return relations;
};

export const collectV1NamesForAddress = Effect.fn("collectV1NamesForAddress")(function* (
  config: EnsforgeConfig,
  address: EthereumAddress,
  selectedRelations: ReadonlySet<NameRelation>,
  filter: NameFilter,
): Effect.fn.Return<
  { readonly names: ReadonlyArray<RelatedIndexedName>; readonly indexedBlock: bigint },
  GetNamesForAddressError
> {
  const normalizedAddress = address.toLowerCase();

  const relationFilters = [
    ...(selectedRelations.has("owner") || selectedRelations.has("manager")
      ? [{ owner: normalizedAddress }, { wrappedOwner: normalizedAddress }]
      : []),
    ...(selectedRelations.has("registry-owner") ? [{ owner: normalizedAddress }] : []),
    ...(selectedRelations.has("registrant") ? [{ registrant: normalizedAddress }] : []),
    ...(selectedRelations.has("wrapped-owner") ? [{ wrappedOwner: normalizedAddress }] : []),
    ...(selectedRelations.has("resolved-address") ? [{ resolvedAddress: normalizedAddress }] : []),
  ];

  if (relationFilters.length === 0) return { names: [], indexedBlock: 0n };

  const names = new Map<string, RelatedIndexedName>();
  let skip = 0;
  let indexedBlock = 0n;

  while (true) {
    const response = yield* requestIndexer<
      V1GetNamesForAddressQuery,
      V1GetNamesForAddressQueryVariables
    >(config, {
      protocol: "v1",
      operationName,
      document: V1GetNamesForAddressDocument,
      variables: {
        first: batchSize,
        skip,
        where: { or: relationFilters },
      },
    });

    const data = yield* requireIndexerData(config, "v1", operationName, response);

    indexedBlock = yield* decodeIndexedBlock(
      config,
      "v1",
      operationName,
      data["_meta"].block.number,
    );

    for (const wire of data.domains) {
      const item = yield* normalizeV1IndexedName(wire, {
        network: config.network,
        protocol: "v1",
        indexedBlock,
        operationName,
      });

      const relations = relationsFor(wire, normalizedAddress).filter((relation) =>
        selectedRelations.has(relation),
      );

      if (relations.length > 0 && matchesNameFilter(item, filter)) {
        names.set(item.namehash.toLowerCase(), { ...item, relations });
      }
    }

    if (data.domains.length < batchSize) break;

    skip += batchSize;
  }

  return { names: [...names.values()], indexedBlock };
});
