import { Effect, Schema } from "effect";

import {
  IndexedNameV1,
  IndexedNameV2,
  type IndexedName,
} from "../../../actions/indexer/models/name.js";
import { IndexerDecodeError } from "../../../errors/indexer-decode-error.js";
import type { IndexerNormalizationContext } from "./context.js";
import {
  decodeAddress,
  decodeDomainNamehash,
  decodeIndexedNameValue,
  decodeInteger,
  decodeNullableAddress,
  decodeNullableBigInt,
  decodeNullableInteger,
  decodeNullableLabelhash,
  decodeNullableDomainNamehash,
} from "./scalars.js";

interface AccountWire {
  readonly id: unknown;
}

interface RegistryWire {
  readonly address: unknown;
}

export interface V2IndexedNameWire {
  readonly id: unknown;
  readonly protocol: unknown;
  readonly name: unknown;
  readonly labelName: unknown;
  readonly labelhash: unknown;
  readonly parent: { readonly id: unknown; readonly subregistry: RegistryWire | null } | null;
  readonly owner: AccountWire;
  readonly registrant: AccountWire | null;
  readonly resolvedAddress: AccountWire | null;
  readonly resolver: { readonly address: unknown } | null;
  readonly createdAt: unknown;
  readonly expiryDate: unknown;
  readonly subdomainCount: unknown;
  readonly isMigrated: unknown;
  readonly ttl: unknown;
  readonly wrappedOwner: AccountWire | null;
  readonly wrappedDomain: {
    readonly owner: AccountWire | null;
    readonly fuses: unknown;
    readonly expiryDate: unknown;
  } | null;
  readonly subregistry: RegistryWire | null;
  readonly canonicalId: unknown;
  readonly tokenId: unknown;
  readonly tokenVersion: unknown;
  readonly registrationDate: unknown;
  readonly gracePeriodEnd: unknown;
  readonly unreachableSince: unknown;
  readonly isNormalized: unknown;
  readonly isReachable: unknown;
  readonly isWrapped: unknown;
  readonly roleHolderCount: unknown;
}

export const normalizeV2IndexerName = Effect.fn("normalizeV2IndexerName")(function* (
  wire: V2IndexedNameWire,
  context: IndexerNormalizationContext,
): Effect.fn.Return<IndexedName, IndexerDecodeError> {
  return yield* Effect.try({
    try: () => {
      const indexedNamehash = decodeDomainNamehash(wire.id, wire.name);
      const protocol = Schema.decodeUnknownSync(Schema.Literals(["v1", "v2"]))(wire.protocol);

      const common = {
        namehash: indexedNamehash,
        name: decodeIndexedNameValue(wire.name, indexedNamehash),
        label:
          wire.labelName === null ? null : Schema.decodeUnknownSync(Schema.String)(wire.labelName),
        labelhash: decodeNullableLabelhash(wire.labelhash),
        parentNamehash: decodeNullableDomainNamehash(wire.parent?.id),
        owner: decodeAddress(wire.owner.id),
        resolver: decodeNullableAddress(wire.resolver?.address),
        resolvedAddress: decodeNullableAddress(wire.resolvedAddress?.id),
        createdAt: BigInt(decodeInteger(wire.createdAt)),
        expiry: wire.expiryDate === null ? null : BigInt(decodeInteger(wire.expiryDate)),
        subnameCount: decodeInteger(wire.subdomainCount),
        isMigrated: Schema.decodeUnknownSync(Schema.Boolean)(wire.isMigrated),
        source: {
          network: context.network,
          protocol: context.protocol,
          indexedBlock: context.indexedBlock,
        },
      };

      if (protocol === "v1") {
        const wrappedOwner = decodeNullableAddress(wire.wrappedDomain?.owner?.id);

        return Schema.decodeUnknownSync(IndexedNameV1)({
          ...common,
          protocol,
          owner: wrappedOwner ?? decodeNullableAddress(wire.wrappedOwner?.id) ?? common.owner,
          registryOwner: null,
          registrant: decodeNullableAddress(wire.registrant?.id),
          ttl: wire.ttl === null ? null : BigInt(decodeInteger(wire.ttl)),
          registration: null,
          wrapped:
            wire.wrappedDomain === null || wrappedOwner === null
              ? null
              : {
                  owner: wrappedOwner,
                  fuses:
                    wire.wrappedDomain.fuses === null
                      ? 0n
                      : BigInt(decodeInteger(wire.wrappedDomain.fuses)),
                  expiry:
                    wire.wrappedDomain.expiryDate === null
                      ? null
                      : BigInt(decodeInteger(wire.wrappedDomain.expiryDate)),
                },
        });
      }

      const registry = decodeNullableAddress(wire.parent?.subregistry?.address);
      const tokenId = decodeNullableBigInt(wire.tokenId);

      return Schema.decodeUnknownSync(IndexedNameV2)({
        ...common,
        protocol,
        registry,
        subregistry: decodeNullableAddress(wire.subregistry?.address),
        canonicalId: decodeNullableBigInt(wire.canonicalId),
        token:
          registry === null || tokenId === null
            ? null
            : { standard: "erc721", contract: registry, tokenId, owner: common.owner },
        tokenVersion: decodeNullableInteger(wire.tokenVersion),
        registeredAt:
          wire.registrationDate === null ? null : BigInt(decodeInteger(wire.registrationDate)),
        gracePeriodEnd:
          wire.gracePeriodEnd === null ? null : BigInt(decodeInteger(wire.gracePeriodEnd)),
        unreachableSince:
          wire.unreachableSince === null ? null : BigInt(decodeInteger(wire.unreachableSince)),
        isNormalized: Schema.decodeUnknownSync(Schema.Boolean)(wire.isNormalized),
        isReachable: Schema.decodeUnknownSync(Schema.Boolean)(wire.isReachable),
        isWrapped: Schema.decodeUnknownSync(Schema.Boolean)(wire.isWrapped),
        roleHolderCount: decodeInteger(wire.roleHolderCount),
      });
    },
    catch: (cause) =>
      new IndexerDecodeError({
        code: "INVALID_RESPONSE",
        message: `The ${context.network}:${context.protocol} indexer returned an invalid indexed name`,
        network: context.network,
        protocol: context.protocol,
        operationName: context.operationName,
        cause,
      }),
  });
});
