import { Effect, Schema } from "effect";

import { IndexedNameV1, type IndexedName } from "../../../actions/indexer/models/name.js";
import { IndexerDecodeError } from "../../../errors/indexer-decode-error.js";
import type { IndexerNormalizationContext } from "./context.js";
import {
  decodeAddress,
  decodeBigInt,
  decodeDomainNamehash,
  decodeIndexedNameValue,
  decodeInteger,
  decodeNullableAddress,
  decodeNullableBigInt,
  decodeNullableLabelhash,
  decodeNullableDomainNamehash,
} from "./scalars.js";

interface AccountWire {
  readonly id: unknown;
}

export interface V1IndexedNameWire {
  readonly id: unknown;
  readonly name: unknown;
  readonly labelName: unknown;
  readonly labelhash: unknown;
  readonly parent: { readonly id: unknown } | null;
  readonly owner: AccountWire;
  readonly registrant: AccountWire | null;
  readonly resolvedAddress: AccountWire | null;
  readonly resolver: { readonly address: unknown } | null;
  readonly createdAt: unknown;
  readonly expiryDate: unknown;
  readonly subdomainCount: unknown;
  readonly isMigrated: unknown;
  readonly ttl: unknown;
  readonly registration: {
    readonly registrant: AccountWire;
    readonly registrationDate: unknown;
    readonly expiryDate: unknown;
  } | null;
  readonly wrappedOwner: AccountWire | null;
  readonly wrappedDomain: {
    readonly owner: AccountWire;
    readonly fuses: unknown;
    readonly expiryDate: unknown;
  } | null;
}

export const normalizeV1IndexedName = Effect.fn("normalizeV1IndexedName")(function* (
  wire: V1IndexedNameWire,
  context: IndexerNormalizationContext,
): Effect.fn.Return<IndexedName, IndexerDecodeError> {
  return yield* Effect.try({
    try: () => {
      const indexedNamehash = decodeDomainNamehash(wire.id, wire.name);
      const registryOwner = decodeAddress(wire.owner.id);

      const wrapped =
        wire.wrappedDomain === null
          ? null
          : {
              owner: decodeAddress(wire.wrappedDomain.owner.id),
              fuses: BigInt(decodeInteger(wire.wrappedDomain.fuses)),
              expiry: decodeNullableBigInt(wire.wrappedDomain.expiryDate),
            };

      return Schema.decodeUnknownSync(IndexedNameV1)({
        protocol: "v1",
        namehash: indexedNamehash,
        name: decodeIndexedNameValue(wire.name, indexedNamehash),
        label:
          wire.labelName === null ? null : Schema.decodeUnknownSync(Schema.String)(wire.labelName),
        labelhash: decodeNullableLabelhash(wire.labelhash),
        parentNamehash: decodeNullableDomainNamehash(wire.parent?.id),
        owner: wrapped?.owner ?? decodeNullableAddress(wire.wrappedOwner?.id) ?? registryOwner,
        registryOwner,
        registrant: decodeNullableAddress(wire.registrant?.id),
        resolver: decodeNullableAddress(wire.resolver?.address),
        resolvedAddress: decodeNullableAddress(wire.resolvedAddress?.id),
        createdAt: decodeBigInt(wire.createdAt),
        expiry: decodeNullableBigInt(wire.expiryDate),
        subnameCount: decodeInteger(wire.subdomainCount),
        // The V1 flag describes the 2020 registry migration, not ENSv2 migration.
        isMigrated: false,
        ttl: decodeNullableBigInt(wire.ttl),
        registration:
          wire.registration === null
            ? null
            : {
                registrant: decodeAddress(wire.registration.registrant.id),
                registeredAt: decodeBigInt(wire.registration.registrationDate),
                expiry: decodeBigInt(wire.registration.expiryDate),
              },
        wrapped,
        source: {
          network: context.network,
          protocol: context.protocol,
          indexedBlock: context.indexedBlock,
        },
      });
    },
    catch: (cause) =>
      new IndexerDecodeError({
        code: "INVALID_RESPONSE",
        message: `The ${context.network}:${context.protocol} indexer returned an invalid V1 name`,
        network: context.network,
        protocol: context.protocol,
        operationName: context.operationName,
        cause,
      }),
  });
});
