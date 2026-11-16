import { Effect, Schema } from "effect";

import { pubkeyResolverAbi } from "@ensforge/contracts/shared";
import { decodeFunctionResult, encodeFunctionData, zeroHash } from "viem";

import { ContractError } from "../../../errors/contract-error.js";
import { resolveRecords } from "../../../internal/resolver/resolve-records.js";
import { namehash } from "../../../names/hashes.js";
import { Hex } from "../../../schemas/hex.js";
import type { NormalizedName } from "../../../schemas/name.js";

export const resolvePubkey = Effect.fn("resolvePubkey")(function* (name: NormalizedName) {
  const call = yield* Effect.try({
    try: () =>
      encodeFunctionData({
        abi: pubkeyResolverAbi,
        functionName: "pubkey",
        args: [namehash(name)],
      }),
    catch: (cause) =>
      new ContractError({
        code: "ENCODE_FAILED",
        message: "Unable to encode the ENS public key resolver call",
        cause,
      }),
  });

  const results = yield* resolveRecords(name, [call]);

  if (results === null) return null;

  const encodedResult = results[0];

  if (encodedResult === undefined) {
    return yield* new ContractError({
      code: "DECODE_FAILED",
      message: "Public key resolution returned no result",
      cause: { name },
    });
  }

  const [encodedX, encodedY] = yield* Effect.try({
    try: () =>
      decodeFunctionResult({
        abi: pubkeyResolverAbi,
        functionName: "pubkey",
        data: encodedResult,
      }),
    catch: (cause) =>
      new ContractError({
        code: "DECODE_FAILED",
        message: "Unable to decode the ENS public key resolver result",
        cause,
      }),
  });

  if (encodedX === zeroHash && encodedY === zeroHash) return null;

  const [x, y] = yield* Effect.try({
    try: () => [Schema.decodeSync(Hex)(encodedX), Schema.decodeSync(Hex)(encodedY)] as const,
    catch: (cause) =>
      new ContractError({
        code: "DECODE_FAILED",
        message: "Unable to decode the ENS public key coordinates",
        cause,
      }),
  });

  return { x, y };
});
