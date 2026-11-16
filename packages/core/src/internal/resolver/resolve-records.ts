import { Effect } from "effect";

import { multicallResolverAbi } from "@ensforge/contracts/shared";
import { decodeFunctionResult, encodeFunctionData, type Hex } from "viem";

import { ContractError } from "../../errors/contract-error.js";
import { dnsEncodeName } from "../../names/dns.js";
import type { NormalizedName } from "../../schemas/name.js";
import { isContractRevert } from "../errors/viem-error.js";
import { DeploymentService } from "../services/deployment.js";
import { resolveName } from "./resolve-name.js";

export const resolveRecords = Effect.fn("resolveRecords")(function* (
  name: NormalizedName,
  calls: ReadonlyArray<Hex>,
) {
  if (calls.length === 0) return [];

  const firstCall = calls[0];

  if (firstCall === undefined) return [];

  const data =
    calls.length === 1
      ? firstCall
      : yield* Effect.try({
          try: () =>
            encodeFunctionData({
              abi: multicallResolverAbi,
              functionName: "multicall",
              args: [calls],
            }),
          catch: (cause) =>
            new ContractError({
              code: "ENCODE_FAILED",
              message: "Unable to encode the resolver record multicall",
              cause,
            }),
        });

  const deployment = yield* DeploymentService;
  const protocol = deployment.profile.protocol;

  const universalResolver =
    protocol === "v1"
      ? deployment.profile.v1.contracts.universalResolver
      : deployment.profile.v2.contracts.universalResolver;

  const dnsName = yield* dnsEncodeName.effect(name);

  const resolved = yield* resolveName({
    universalResolver,
    protocol,
    name: dnsName,
    data,
  }).pipe(
    Effect.catchIf(
      (error) => isContractRevert(error.cause, "ResolverNotFound"),
      () => Effect.succeed(null),
    ),
  );

  if (resolved === null) return null;

  const [encodedResults] = resolved;

  const results = yield* Effect.try({
    try: () =>
      calls.length === 1
        ? [encodedResults]
        : decodeFunctionResult({
            abi: multicallResolverAbi,
            functionName: "multicall",
            data: encodedResults,
          }),
    catch: (cause) =>
      new ContractError({
        code: "DECODE_FAILED",
        message: "Unable to decode ENS resolver record results",
        cause,
      }),
  });

  if (results.length !== calls.length) {
    return yield* new ContractError({
      code: "DECODE_FAILED",
      message: "Resolver returned an unexpected number of records",
      cause: { expected: calls.length, actual: results.length },
    });
  }

  return results;
});
