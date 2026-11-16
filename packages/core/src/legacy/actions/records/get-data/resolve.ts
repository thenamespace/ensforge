import { Effect, Schema } from "effect";

import { dataResolverAbi } from "@ensforge/contracts/shared";
import { decodeFunctionResult, encodeFunctionData } from "viem";

import { ContractError } from "../../../errors/contract-error.js";
import { resolveRecords } from "../../../internal/resolver/resolve-records.js";
import { namehash } from "../../../names/hashes.js";
import { Hex } from "../../../schemas/hex.js";
import type { NormalizedName } from "../../../schemas/name.js";

export const resolveData = Effect.fn("resolveData")(function* (name: NormalizedName, key: string) {
  const call = yield* Effect.try({
    try: () =>
      encodeFunctionData({
        abi: dataResolverAbi,
        functionName: "data",
        args: [namehash(name), key],
      }),
    catch: (cause) =>
      new ContractError({
        code: "ENCODE_FAILED",
        message: "Unable to encode the ENS data resolver call",
        cause,
      }),
  });

  const results = yield* resolveRecords(name, [call]);

  if (results === null) return { key, value: null } as const;

  const encodedResult = results[0];

  if (encodedResult === undefined) {
    return yield* new ContractError({
      code: "DECODE_FAILED",
      message: "Data resolution returned no result",
      cause: { name, key },
    });
  }

  const value = yield* Effect.try({
    try: () =>
      Schema.decodeSync(Hex)(
        decodeFunctionResult({
          abi: dataResolverAbi,
          functionName: "data",
          data: encodedResult,
        }),
      ),
    catch: (cause) =>
      new ContractError({
        code: "DECODE_FAILED",
        message: `Unable to decode the ENS data record for key ${key}`,
        cause,
      }),
  });

  return { key, value: value === "0x" ? null : value } as const;
});
