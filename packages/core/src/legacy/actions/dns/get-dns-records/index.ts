import { Effect } from "effect";

import { defineReadAction } from "../../../action/read-request.js";
import type { EnsforgeConfig } from "../../../config/config.js";
import { resolveDnsRecords } from "../../../internal/dns/resolve-dns-records.js";
import { executeRead } from "../../../internal/read/execute-read.js";
import { normalizeName } from "../../../names/normalize.js";
import { getResolver } from "../../resolution/get-resolver/index.js";
import type { DnsReadError, DnsRecordsResult, GetDnsRecordsParameters } from "../types.js";

const getDnsRecordsEffect = Effect.fn("ensforge.getDnsRecords")(function* (
  config: EnsforgeConfig,
  parameters: GetDnsRecordsParameters,
) {
  const name = yield* normalizeName.effect(parameters.name);

  const queries = yield* Effect.forEach(parameters.records, (record) =>
    normalizeName
      .effect(record.recordName)
      .pipe(Effect.map((recordName) => ({ ...record, recordName }))),
  );

  return yield* executeRead(
    config,
    parameters,
    Effect.gen(function* () {
      const [resolver, values] = yield* Effect.all(
        [getResolver.effect(config, parameters), resolveDnsRecords(name, queries)] as const,
        { concurrency: "unbounded" },
      );

      return {
        name,
        resolver,
        records: queries.map((query, index) => ({
          name,
          recordName: query.recordName,
          resource: query.resource,
          resolver,
          value:
            values?.[index] === undefined || values[index] === "0x"
              ? null
              : (values[index] ?? null),
        })),
      } satisfies DnsRecordsResult;
    }),
  );
});

export const getDnsRecords = defineReadAction<
  GetDnsRecordsParameters,
  DnsRecordsResult,
  DnsReadError
>(getDnsRecordsEffect);

export type {
  DnsReadError as GetDnsRecordsError,
  DnsRecordsResult,
  GetDnsRecordsParameters,
} from "../types.js";
