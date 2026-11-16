import { Effect } from "effect";

import { dnsRecordResolverAbi } from "@ensforge/contracts/shared";
import { decodeFunctionResult, encodeFunctionData, keccak256 } from "viem";

import type { DnsRecordQuery } from "../../actions/dns/types.js";
import { ContractError } from "../../errors/contract-error.js";
import { dnsEncodeName } from "../../names/dns.js";
import { namehash } from "../../names/hashes.js";
import type { NormalizedName } from "../../schemas/name.js";
import { resolveRecords } from "../resolver/resolve-records.js";

export const resolveDnsRecords = Effect.fn("resolveDnsRecords")(function* (
  name: NormalizedName,
  queries: ReadonlyArray<{ readonly recordName: NormalizedName } & DnsRecordQuery>,
) {
  const calls = yield* Effect.forEach(queries, (query) =>
    Effect.try({
      try: () =>
        encodeFunctionData({
          abi: dnsRecordResolverAbi,
          functionName: "dnsRecord",
          args: [namehash(name), keccak256(dnsEncodeName(query.recordName)), query.resource],
        }),
      catch: (cause) =>
        new ContractError({
          code: "ENCODE_FAILED",
          message: `Unable to encode DNS record ${query.recordName}`,
          cause,
        }),
    }),
  );

  const encoded = yield* resolveRecords(name, calls);

  if (encoded === null) return null;

  return yield* Effect.forEach(encoded, (value, index) =>
    Effect.try({
      try: () =>
        decodeFunctionResult({
          abi: dnsRecordResolverAbi,
          functionName: "dnsRecord",
          data: value,
        }),
      catch: (cause) =>
        new ContractError({
          code: "DECODE_FAILED",
          message: `Unable to decode DNS record ${queries[index]?.recordName ?? index}`,
          cause,
        }),
    }),
  );
});
