import { Effect, Schema } from "effect";

import { interfaceResolverAbi } from "@ensforge/contracts/shared";
import { decodeFunctionResult, encodeFunctionData, zeroAddress } from "viem";

import { CodecError } from "../../../errors/codec-error.js";
import { ContractError } from "../../../errors/contract-error.js";
import { resolveRecords } from "../../../internal/resolver/resolve-records.js";
import { namehash } from "../../../names/hashes.js";
import { EthereumAddress } from "../../../schemas/identity.js";
import type { NormalizedName } from "../../../schemas/name.js";
import { InterfaceId } from "../../../schemas/records.js";

export const resolveInterface = Effect.fn("resolveInterface")(function* (
  name: NormalizedName,
  input: string,
) {
  const interfaceId = yield* Effect.try({
    try: () => Schema.decodeUnknownSync(InterfaceId)(input),
    catch: () =>
      new CodecError({
        code: "INVALID_INTERFACE_ID",
        message: `Invalid EIP-165 interface ID: ${input}`,
      }),
  });

  const call = yield* Effect.try({
    try: () =>
      encodeFunctionData({
        abi: interfaceResolverAbi,
        functionName: "interfaceImplementer",
        args: [namehash(name), interfaceId],
      }),
    catch: (cause) =>
      new ContractError({
        code: "ENCODE_FAILED",
        message: "Unable to encode the ENS interface resolver call",
        cause,
      }),
  });

  const results = yield* resolveRecords(name, [call]);

  if (results === null) return { interfaceId, implementer: null } as const;

  const encodedResult = results[0];

  if (encodedResult === undefined) {
    return yield* new ContractError({
      code: "DECODE_FAILED",
      message: "Interface resolution returned no result",
      cause: { name, interfaceId },
    });
  }

  const implementer = yield* Effect.try({
    try: () =>
      Schema.decodeSync(EthereumAddress)(
        decodeFunctionResult({
          abi: interfaceResolverAbi,
          functionName: "interfaceImplementer",
          data: encodedResult,
        }),
      ),
    catch: (cause) =>
      new ContractError({
        code: "DECODE_FAILED",
        message: "Unable to decode the ENS interface resolver result",
        cause,
      }),
  });

  return {
    interfaceId,
    implementer: implementer === zeroAddress ? null : implementer,
  } as const;
});
