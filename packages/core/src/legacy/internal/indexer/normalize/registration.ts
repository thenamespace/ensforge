import { Effect, Schema } from "effect";

import { IndexedRegistration } from "../../../actions/indexer/models/registration.js";
import type { EnsNetworkId } from "../../../config/network.js";
import { IndexerDecodeError } from "../../../errors/indexer-decode-error.js";
import type { V1GetRegistrationsQuery } from "../generated/v1/get-registrations.js";
import type { V2GetRegistrationsQuery } from "../generated/v2/get-registrations.js";
import {
  decodeAddress,
  decodeBigInt,
  decodeDomainNamehash,
  decodeHex,
  decodeIndexedNameValue,
} from "./scalars.js";

type V1Registration = V1GetRegistrationsQuery["registrations"][number];

type V2Registration = V2GetRegistrationsQuery["registrationConnection"]["edges"][number]["node"];

const normalizeCost = (
  total: unknown,
  base: unknown,
  premium: unknown,
): IndexedRegistration["cost"] => ({
  currency: "native",
  total: total === null || total === undefined ? null : decodeBigInt(total),
  base: base === null || base === undefined ? null : decodeBigInt(base),
  premium: premium === null || premium === undefined ? null : decodeBigInt(premium),
});

export const normalizeV1Registration = Effect.fn("normalizeV1Registration")(function* (
  wire: V1Registration,
  context: { readonly network: EnsNetworkId; readonly indexedBlock: bigint },
): Effect.fn.Return<IndexedRegistration, IndexerDecodeError> {
  return yield* Effect.try({
    try: () => {
      const namehash = decodeDomainNamehash(wire.domain.id, wire.domain.name);

      return Schema.decodeUnknownSync(IndexedRegistration)({
        id: wire.id,
        protocol: "v1",
        namehash,
        name: decodeIndexedNameValue(wire.domain.name, namehash),
        label: wire.labelName,
        registrant: decodeAddress(wire.registrant.id),
        currentOwner: decodeAddress(wire.domain.owner.id),
        registeredAt: decodeBigInt(wire.registrationDate),
        expiry: decodeBigInt(wire.expiryDate),
        cost: normalizeCost(wire.cost, null, null),
        referrer: null,
        source: { network: context.network, protocol: "v1", indexedBlock: context.indexedBlock },
      });
    },
    catch: (cause) =>
      new IndexerDecodeError({
        code: "INVALID_RESPONSE",
        message: "Unable to decode a V1 registration",
        network: context.network,
        protocol: "v1",
        operationName: "V1GetRegistrations",
        cause,
      }),
  });
});

export const normalizeV2Registration = Effect.fn("normalizeV2Registration")(function* (
  wire: V2Registration,
  context: { readonly network: EnsNetworkId; readonly indexedBlock: bigint },
): Effect.fn.Return<IndexedRegistration, IndexerDecodeError> {
  return yield* Effect.try({
    try: () => {
      const protocol = Schema.decodeUnknownSync(Schema.Literals(["v1", "v2"]))(wire.protocol);
      const namehash = decodeDomainNamehash(wire.domain.id, wire.name);

      return Schema.decodeUnknownSync(IndexedRegistration)({
        id: wire.id,
        protocol,
        namehash,
        name: decodeIndexedNameValue(wire.name, namehash),
        label: wire.labelName,
        registrant: decodeAddress(wire.registrant.id),
        currentOwner: decodeAddress(wire.domain.owner.id),
        registeredAt: BigInt(wire.registrationDate),
        expiry: BigInt(wire.expiryDate),
        cost: normalizeCost(wire.cost, wire.baseCost, wire.premium),
        referrer: wire.referrer === null ? null : decodeHex(wire.referrer),
        source: { network: context.network, protocol, indexedBlock: context.indexedBlock },
      });
    },
    catch: (cause) =>
      new IndexerDecodeError({
        code: "INVALID_RESPONSE",
        message: "Unable to decode a V2 registration",
        network: context.network,
        protocol: "v2",
        operationName: "V2GetRegistrations",
        cause,
      }),
  });
});
