import { Effect } from "effect";

import { defineReadAction } from "../../../action/read-request.js";
import type { EnsforgeConfig } from "../../../config/config.js";
import { resolveDnsRecords } from "../../../internal/dns/resolve-dns-records.js";
import { executeRead } from "../../../internal/read/execute-read.js";
import { normalizeName } from "../../../names/normalize.js";
import { getResolver } from "../../resolution/get-resolver/index.js";
import type { DnsReadError, DnsRecordResult, GetDnsRecordParameters } from "../types.js";

const getDnsRecordEffect = Effect.fn("ensforge.getDnsRecord")(function* (
  config: EnsforgeConfig,
  parameters: GetDnsRecordParameters,
) {
  const [name, recordName] = yield* Effect.all(
    [normalizeName.effect(parameters.name), normalizeName.effect(parameters.recordName)] as const,
    { concurrency: "unbounded" },
  );

  return yield* executeRead(
    config,
    parameters,
    Effect.gen(function* () {
      const [resolver, values] = yield* Effect.all(
        [
          getResolver.effect(config, parameters),
          resolveDnsRecords(name, [{ recordName, resource: parameters.resource }]),
        ] as const,
        { concurrency: "unbounded" },
      );

      const value = values?.[0];

      return {
        name,
        recordName,
        resource: parameters.resource,
        resolver,
        value: value === undefined || value === "0x" ? null : value,
      } satisfies DnsRecordResult;
    }),
  );
});

export const getDnsRecord = defineReadAction<GetDnsRecordParameters, DnsRecordResult, DnsReadError>(
  getDnsRecordEffect,
);

export type {
  DnsReadError as GetDnsRecordError,
  DnsRecordResult,
  GetDnsRecordParameters,
} from "../types.js";
