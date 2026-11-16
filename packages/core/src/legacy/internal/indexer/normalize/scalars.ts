import { Schema } from "effect";

import { getAddress } from "viem";
import { namehash, normalize } from "viem/ens";

import type { IndexedNameValue } from "../../../actions/indexer/models/name.js";
import { Labelhash, Namehash } from "../../../schemas/hash.js";
import { Hex } from "../../../schemas/hex.js";
import { EthereumAddress } from "../../../schemas/identity.js";
import { NormalizedName } from "../../../schemas/name.js";

export const decodeAddress = (value: unknown) =>
  Schema.decodeUnknownSync(EthereumAddress)(
    getAddress(Schema.decodeUnknownSync(Schema.String)(value)),
  );

export const decodeNullableAddress = (value: unknown) =>
  value === null || value === undefined ? null : decodeAddress(value);

export const decodeDomainNamehash = (identifier: unknown, indexedName?: unknown) => {
  const rawIdentifier = Schema.decodeUnknownSync(Schema.String)(identifier);

  const identifierNamehash = Schema.is(Namehash)(rawIdentifier)
    ? rawIdentifier
    : Schema.decodeUnknownSync(Namehash)(namehash(rawIdentifier));

  if (indexedName !== null && indexedName !== undefined) {
    const rawName = Schema.decodeUnknownSync(Schema.String)(indexedName);

    if (namehash(rawName).toLowerCase() !== identifierNamehash.toLowerCase()) {
      throw new Error("Indexed name does not match its identifier");
    }
  }

  return identifierNamehash;
};

export const decodeNullableDomainNamehash = (value: unknown) =>
  value === null || value === undefined ? null : decodeDomainNamehash(value);

export const decodeNullableLabelhash = (value: unknown) =>
  value === null || value === undefined ? null : Schema.decodeUnknownSync(Labelhash)(value);

export const decodeBigInt = (value: unknown) => {
  const raw = Schema.decodeUnknownSync(Schema.String)(value);

  return Schema.decodeUnknownSync(Schema.BigInt)(BigInt(raw));
};

export const decodeNullableBigInt = (value: unknown) =>
  value === null || value === undefined ? null : decodeBigInt(value);

export const decodeInteger = (value: unknown) => Schema.decodeUnknownSync(Schema.Int)(value);

export const decodeHex = (value: unknown) => Schema.decodeUnknownSync(Hex)(value);

export const decodeNullableInteger = (value: unknown) =>
  value === null || value === undefined ? null : decodeInteger(value);

export const decodeIndexedNameValue = (
  value: unknown,
  expectedNamehash: Namehash,
): IndexedNameValue => {
  if (value === null || value === undefined) return { kind: "unknown", value: null };

  const rawName = Schema.decodeUnknownSync(Schema.String)(value);

  try {
    const normalized = Schema.decodeUnknownSync(NormalizedName)(normalize(rawName));

    if (namehash(normalized).toLowerCase() !== expectedNamehash.toLowerCase()) {
      return { kind: "encoded", value: rawName };
    }

    return { kind: "normalized", value: normalized };
  } catch {
    return { kind: "encoded", value: rawName };
  }
};
