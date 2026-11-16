import { Effect } from "effect";

import { dnsZoneResolverAbi } from "@ensforge/contracts/shared";
import { decodeFunctionResult, encodeFunctionData } from "viem";

import type { BlockParameters } from "../../../action/block.js";
import { defineReadAction } from "../../../action/read-request.js";
import type { EnsforgeConfig } from "../../../config/config.js";
import { ContractError } from "../../../errors/contract-error.js";
import { executeRead } from "../../../internal/read/execute-read.js";
import { resolveRecords } from "../../../internal/resolver/resolve-records.js";
import { namehash } from "../../../names/hashes.js";
import { normalizeName } from "../../../names/normalize.js";
import { getResolver } from "../../resolution/get-resolver/index.js";
import type { DnsReadError, ZoneHashResult } from "../types.js";

export type GetZoneHashParameters = { readonly name: string } & BlockParameters;

const getZoneHashEffect = Effect.fn("ensforge.getZoneHash")(function* (
  config: EnsforgeConfig,
  parameters: GetZoneHashParameters,
) {
  const name = yield* normalizeName.effect(parameters.name);

  const call = yield* Effect.try({
    try: () =>
      encodeFunctionData({
        abi: dnsZoneResolverAbi,
        functionName: "zonehash",
        args: [namehash(name)],
      }),
    catch: (cause) =>
      new ContractError({
        code: "ENCODE_FAILED",
        message: `Unable to encode the DNS zone hash call for ${name}`,
        cause,
      }),
  });

  return yield* executeRead(
    config,
    parameters,
    Effect.gen(function* () {
      const [resolver, result] = yield* Effect.all(
        [getResolver.effect(config, parameters), resolveRecords(name, [call])] as const,
        { concurrency: "unbounded" },
      );

      if (result === null || result[0] === undefined) {
        return { name, resolver, value: null } satisfies ZoneHashResult;
      }

      const encoded = result[0];

      const value = yield* Effect.try({
        try: () =>
          decodeFunctionResult({
            abi: dnsZoneResolverAbi,
            functionName: "zonehash",
            data: encoded,
          }),
        catch: (cause) =>
          new ContractError({
            code: "DECODE_FAILED",
            message: `Unable to decode the DNS zone hash for ${name}`,
            cause,
          }),
      });

      return { name, resolver, value: value === "0x" ? null : value } satisfies ZoneHashResult;
    }),
  );
});

export const getZoneHash = defineReadAction<GetZoneHashParameters, ZoneHashResult, DnsReadError>(
  getZoneHashEffect,
);

export type { DnsReadError as GetZoneHashError, ZoneHashResult } from "../types.js";
