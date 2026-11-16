import { Effect, Schema } from "effect";

import {
  IndexedRegistry,
  IndexedRegistryRole,
  type IndexedRegistry as IndexedRegistryType,
  type IndexedRegistryRole as IndexedRegistryRoleType,
} from "../../../actions/indexer/models/registry.js";
import { IndexerDecodeError } from "../../../errors/indexer-decode-error.js";
import type { V2GetRegistryRolesQuery } from "../generated/v2/get-registry-roles.js";
import type { V2RegistryFieldsFragment } from "../generated/v2/get-registry.js";
import type { IndexerNormalizationContext } from "./context.js";
import {
  decodeAddress,
  decodeDomainNamehash,
  decodeHex,
  decodeIndexedNameValue,
  decodeInteger,
  decodeNullableAddress,
} from "./scalars.js";

type RegistryRoleWire = V2GetRegistryRolesQuery["roleConnection"]["edges"][number]["node"];

export const normalizeV2Registry = Effect.fn("normalizeV2Registry")(function* (
  wire: V2RegistryFieldsFragment,
  context: IndexerNormalizationContext,
): Effect.fn.Return<IndexedRegistryType, IndexerDecodeError> {
  return yield* Effect.try({
    try: () => {
      const namehash = decodeDomainNamehash(wire.namehash, wire.name);

      return Schema.decodeUnknownSync(IndexedRegistry)({
        address: decodeAddress(wire.address),
        managedName: decodeIndexedNameValue(wire.name, namehash),
        namehash,
        owner: decodeNullableAddress(wire.owner?.id),
        parentRegistry: decodeAddress(wire.parentRegistry),
        createdAt: BigInt(decodeInteger(wire.createdAt)),
        createdBlock: BigInt(decodeInteger(wire.createdBlock)),
        labelCount: decodeInteger(wire.labelCount),
        referencedByCount: decodeInteger(wire.referencedByCount),
        roleCount: decodeInteger(wire.roleCount),
        eventCount: decodeInteger(wire.eventCount),
        source: {
          network: context.network,
          protocol: "v2",
          indexedBlock: context.indexedBlock,
        },
      });
    },
    catch: (cause) =>
      new IndexerDecodeError({
        code: "INVALID_RESPONSE",
        message: `The ${context.network}:v2 indexer returned an invalid registry`,
        network: context.network,
        protocol: "v2",
        operationName: context.operationName,
        cause,
      }),
  });
});

export const normalizeV2RegistryRole = Effect.fn("normalizeV2RegistryRole")(function* (
  registry: string,
  wire: RegistryRoleWire,
  context: IndexerNormalizationContext,
): Effect.fn.Return<IndexedRegistryRoleType, IndexerDecodeError> {
  return yield* Effect.try({
    try: () => {
      const bitmap = decodeHex(wire.roleBitmap);

      return Schema.decodeUnknownSync(IndexedRegistryRole)({
        id: wire.id,
        registry: decodeAddress(registry),
        account: decodeAddress(wire.account),
        resource: wire.resource,
        name: wire.name,
        bitmap,
        permissions: wire.permissions,
        active: BigInt(bitmap) !== 0n,
        blockNumber: BigInt(decodeInteger(wire.blockNumber)),
        timestamp: BigInt(decodeInteger(wire.timestamp)),
        transactionHash: decodeHex(wire.transactionHash),
        source: {
          network: context.network,
          protocol: "v2",
          indexedBlock: context.indexedBlock,
        },
      });
    },
    catch: (cause) =>
      new IndexerDecodeError({
        code: "INVALID_RESPONSE",
        message: `The ${context.network}:v2 indexer returned an invalid registry role`,
        network: context.network,
        protocol: "v2",
        operationName: context.operationName,
        cause,
      }),
  });
});
