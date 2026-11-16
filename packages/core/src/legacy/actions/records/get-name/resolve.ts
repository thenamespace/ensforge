import { Effect } from "effect";

import { nameResolverAbi } from "@ensforge/contracts/shared";
import { decodeFunctionResult, encodeFunctionData } from "viem";

import { ContractError } from "../../../errors/contract-error.js";
import { resolveRecords } from "../../../internal/resolver/resolve-records.js";
import { namehash } from "../../../names/hashes.js";
import type { NormalizedName } from "../../../schemas/name.js";

export const resolveNameRecord = Effect.fn("resolveNameRecord")(function* (name: NormalizedName) {
  const call = yield* Effect.try({
    try: () =>
      encodeFunctionData({
        abi: nameResolverAbi,
        functionName: "name",
        args: [namehash(name)],
      }),
    catch: (cause) =>
      new ContractError({
        code: "ENCODE_FAILED",
        message: "Unable to encode the ENS name resolver call",
        cause,
      }),
  });

  const results = yield* resolveRecords(name, [call]);

  if (results === null) return { name: null } as const;

  const encodedResult = results[0];

  if (encodedResult === undefined) {
    return yield* new ContractError({
      code: "DECODE_FAILED",
      message: "Name resolution returned no result",
      cause: { name },
    });
  }

  const value = yield* Effect.try({
    try: () =>
      decodeFunctionResult({
        abi: nameResolverAbi,
        functionName: "name",
        data: encodedResult,
      }),
    catch: (cause) =>
      new ContractError({
        code: "DECODE_FAILED",
        message: "Unable to decode the ENS name resolver result",
        cause,
      }),
  });

  return { name: value.length === 0 ? null : value } as const;
});
