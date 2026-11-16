import { Effect } from "effect";

import { dnsRecordResolverAbi } from "@ensforge/contracts/shared";
import { decodeFunctionResult, encodeFunctionData, keccak256 } from "viem";

import type { BlockParameters } from "../../../action/block.js";
import { defineReadAction } from "../../../action/read-request.js";
import type { EnsforgeConfig } from "../../../config/config.js";
import { ContractError } from "../../../errors/contract-error.js";
import { executeRead } from "../../../internal/read/execute-read.js";
import { resolveRecords } from "../../../internal/resolver/resolve-records.js";
import { dnsEncodeName } from "../../../names/dns.js";
import { namehash } from "../../../names/hashes.js";
import { normalizeName } from "../../../names/normalize.js";
import { getResolver } from "../../resolution/get-resolver/index.js";
import type { DnsReadError, DnsRecordsExistence } from "../types.js";

export type HasDnsRecordsParameters = {
  readonly name: string;
  readonly recordName: string;
} & BlockParameters;

const hasDnsRecordsEffect = Effect.fn("ensforge.hasDnsRecords")(function* (
  config: EnsforgeConfig,
  parameters: HasDnsRecordsParameters,
) {
  const [name, recordName] = yield* Effect.all(
    [normalizeName.effect(parameters.name), normalizeName.effect(parameters.recordName)] as const,
    { concurrency: "unbounded" },
  );

  const call = yield* Effect.try({
    try: () =>
      encodeFunctionData({
        abi: dnsRecordResolverAbi,
        functionName: "hasDNSRecords",
        args: [namehash(name), keccak256(dnsEncodeName(recordName))],
      }),
    catch: (cause) =>
      new ContractError({
        code: "ENCODE_FAILED",
        message: `Unable to encode the DNS record existence call for ${recordName}`,
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
        return { name, recordName, resolver, exists: false } satisfies DnsRecordsExistence;
      }

      const encoded = result[0];

      const exists = yield* Effect.try({
        try: () =>
          decodeFunctionResult({
            abi: dnsRecordResolverAbi,
            functionName: "hasDNSRecords",
            data: encoded,
          }),
        catch: (cause) =>
          new ContractError({
            code: "DECODE_FAILED",
            message: `Unable to decode the DNS record existence result for ${recordName}`,
            cause,
          }),
      });

      return { name, recordName, resolver, exists } satisfies DnsRecordsExistence;
    }),
  );
});

export const hasDnsRecords = defineReadAction<
  HasDnsRecordsParameters,
  DnsRecordsExistence,
  DnsReadError
>(hasDnsRecordsEffect);

export type { DnsReadError as HasDnsRecordsError, DnsRecordsExistence } from "../types.js";
