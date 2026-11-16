import { Effect } from "effect";

import { textResolverAbi } from "@ensforge/contracts/shared";
import { decodeFunctionResult, encodeFunctionData } from "viem";

import { ContractError } from "../../../errors/contract-error.js";
import { resolveRecords } from "../../../internal/resolver/resolve-records.js";
import { namehash } from "../../../names/hashes.js";
import type { NormalizedName } from "../../../schemas/name.js";

export const resolveTexts = Effect.fn("resolveTexts")(function* (
  name: NormalizedName,
  keys: ReadonlyArray<string>,
) {
  if (keys.length === 0) return [];

  const uniqueKeys = Array.from(new Set(keys));
  const node = namehash(name);

  const calls = yield* Effect.try({
    try: () =>
      uniqueKeys.map((key) =>
        encodeFunctionData({
          abi: textResolverAbi,
          functionName: "text",
          args: [node, key],
        }),
      ),
    catch: (cause) =>
      new ContractError({
        code: "ENCODE_FAILED",
        message: "Unable to encode ENS text resolver calls",
        cause,
      }),
  });

  const results = yield* resolveRecords(name, calls);

  if (results === null) {
    return keys.map((key) => ({ key, value: null }));
  }

  const uniqueResults = yield* Effect.forEach(uniqueKeys, (key, index) => {
    const result = results[index];

    if (result === undefined) {
      return new ContractError({
        code: "DECODE_FAILED",
        message: "Resolver returned an unexpected number of text records",
        cause: { index, key },
      });
    }

    return Effect.try({
      try: () => {
        const value = decodeFunctionResult({
          abi: textResolverAbi,
          functionName: "text",
          data: result,
        });

        return { key, value: value.length === 0 ? null : value };
      },
      catch: (cause) =>
        new ContractError({
          code: "DECODE_FAILED",
          message: `Unable to decode the text record for key ${key}`,
          cause,
        }),
    });
  });

  const resultsByKey = new Map(uniqueResults.map((result) => [result.key, result]));

  return yield* Effect.forEach(keys, (key) => {
    const result = resultsByKey.get(key);

    return result === undefined
      ? new ContractError({
          code: "DECODE_FAILED",
          message: "Resolver result could not be matched to its requested text key",
          cause: { key },
        })
      : Effect.succeed(result);
  });
});
