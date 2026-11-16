import { Effect, Schema } from "effect";

import { contenthashResolverAbi } from "@ensforge/contracts/shared";
import { decodeFunctionResult, encodeFunctionData } from "viem";

import { CodecError } from "../../../errors/codec-error.js";
import { ContractError } from "../../../errors/contract-error.js";
import { resolveRecords } from "../../../internal/resolver/resolve-records.js";
import { decodeContentHash } from "../../../names/content-hash.js";
import { namehash } from "../../../names/hashes.js";
import type { NormalizedName } from "../../../schemas/name.js";
import { ContentHash } from "../../../schemas/records.js";

export const resolveContentHash = Effect.fn("resolveContentHash")(function* (name: NormalizedName) {
  const call = yield* Effect.try({
    try: () =>
      encodeFunctionData({
        abi: contenthashResolverAbi,
        functionName: "contenthash",
        args: [namehash(name)],
      }),
    catch: (cause) =>
      new ContractError({
        code: "ENCODE_FAILED",
        message: "Unable to encode the ENS content hash resolver call",
        cause,
      }),
  });

  const results = yield* resolveRecords(name, [call]);

  if (results === null) return { protocol: null, value: null, raw: null } as const;

  const encodedResult = results[0];

  if (encodedResult === undefined) {
    return yield* new ContractError({
      code: "DECODE_FAILED",
      message: "Content hash resolution returned no result",
      cause: { name },
    });
  }

  const raw = yield* Effect.try({
    try: () =>
      Schema.decodeSync(ContentHash)(
        decodeFunctionResult({
          abi: contenthashResolverAbi,
          functionName: "contenthash",
          data: encodedResult,
        }),
      ),
    catch: (cause) =>
      new ContractError({
        code: "DECODE_FAILED",
        message: "Unable to decode the ENS content hash resolver result",
        cause,
      }),
  });

  const decoded = yield* Effect.try({
    try: () => decodeContentHash(raw),
    catch: (cause) =>
      cause instanceof CodecError
        ? cause
        : new CodecError({
            code: "INVALID_CONTENT_HASH",
            message: "Invalid encoded content hash",
          }),
  });

  return decoded === null
    ? ({ protocol: null, value: null, raw: null } as const)
    : ({ protocol: decoded.protocol, value: decoded.value, raw } as const);
});
