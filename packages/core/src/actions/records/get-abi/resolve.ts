import { Effect, Schema } from "effect";

import { abiResolverAbi } from "@ensforge/contracts/shared";
import { decode as decodeCbor } from "cborg";
import { strFromU8, unzlibSync } from "fflate";
import { bytesToString, decodeFunctionResult, encodeFunctionData, hexToBytes } from "viem";

import { CodecError } from "../../../errors/codec-error.js";
import { ContractError } from "../../../errors/contract-error.js";
import { resolveRecords } from "../../../internal/resolver/resolve-records.js";
import { namehash } from "../../../names/hashes.js";
import type { NormalizedName } from "../../../schemas/name.js";
import { Abi, AbiRecordData, type AbiContentType } from "../../../schemas/records.js";

const contentTypeBits = {
  json: 1n,
  "zlib-json": 2n,
  cbor: 4n,
  uri: 8n,
} as const satisfies Record<AbiContentType, bigint>;

const contentTypesByBit = new Map<bigint, AbiContentType>([
  [1n, "json"],
  [2n, "zlib-json"],
  [4n, "cbor"],
  [8n, "uri"],
]);

const decodeAbi = (contentType: Exclude<AbiContentType, "uri">, raw: AbiRecordData) => {
  const bytes = hexToBytes(raw);

  const value =
    contentType === "json"
      ? JSON.parse(bytesToString(bytes))
      : contentType === "zlib-json"
        ? JSON.parse(strFromU8(unzlibSync(bytes)))
        : decodeCbor(bytes);

  return Schema.decodeUnknownSync(Abi)(value);
};

export const resolveAbi = Effect.fn("resolveAbi")(function* (
  name: NormalizedName,
  acceptedContentTypes: ReadonlyArray<AbiContentType>,
) {
  if (acceptedContentTypes.length === 0) {
    return { contentType: null, value: null, raw: null } as const;
  }

  const contentTypes = Array.from(new Set(acceptedContentTypes));

  const contentTypeMask = contentTypes.reduce(
    (mask, contentType) => mask | contentTypeBits[contentType],
    0n,
  );

  const call = yield* Effect.try({
    try: () =>
      encodeFunctionData({
        abi: abiResolverAbi,
        functionName: "ABI",
        args: [namehash(name), contentTypeMask],
      }),
    catch: (cause) =>
      new ContractError({
        code: "ENCODE_FAILED",
        message: "Unable to encode the ENS ABI resolver call",
        cause,
      }),
  });

  const results = yield* resolveRecords(name, [call]);

  if (results === null) return { contentType: null, value: null, raw: null } as const;

  const encodedResult = results[0];

  if (encodedResult === undefined) {
    return yield* new ContractError({
      code: "DECODE_FAILED",
      message: "ABI resolution returned no result",
      cause: { name },
    });
  }

  const [contentTypeBit, encodedAbi] = yield* Effect.try({
    try: () =>
      decodeFunctionResult({
        abi: abiResolverAbi,
        functionName: "ABI",
        data: encodedResult,
      }),
    catch: (cause) =>
      new ContractError({
        code: "DECODE_FAILED",
        message: "Unable to decode the ENS ABI resolver result",
        cause,
      }),
  });

  if (contentTypeBit === 0n || encodedAbi === "0x") {
    return { contentType: null, value: null, raw: null } as const;
  }

  const contentType = contentTypesByBit.get(contentTypeBit);

  if (contentType === undefined) {
    return yield* new CodecError({
      code: "UNSUPPORTED_ABI_CONTENT_TYPE",
      message: `Unsupported ENS ABI content type: ${contentTypeBit}`,
    });
  }

  const raw = yield* Effect.try({
    try: () => Schema.decodeSync(AbiRecordData)(encodedAbi),
    catch: () =>
      new CodecError({
        code: "INVALID_ABI",
        message: `Invalid ${contentType} ENS ABI record`,
      }),
  });

  if (contentType === "uri") {
    const value = yield* Effect.try({
      try: () => bytesToString(hexToBytes(raw)),
      catch: () =>
        new CodecError({
          code: "INVALID_ABI",
          message: "Invalid URI ENS ABI record",
        }),
    });

    return { contentType, value, raw } as const;
  }

  const value = yield* Effect.try({
    try: () => decodeAbi(contentType, raw),
    catch: () =>
      new CodecError({
        code: "INVALID_ABI",
        message: `Invalid ${contentType} ENS ABI record`,
      }),
  });

  return { contentType, value, raw } as const;
});
