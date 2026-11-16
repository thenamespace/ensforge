import { Effect } from "effect";

import { dnsRegistrarV1OracleAbi } from "@ensforge/contracts/internal";

import type { BlockParameters } from "../../../action/block.js";
import { defineReadAction } from "../../../action/read-request.js";
import type { EnsforgeConfig } from "../../../config/config.js";
import { EthereumClient } from "../../../internal/client/ethereum-client.js";
import { executeRead } from "../../../internal/read/execute-read.js";
import { DeploymentService } from "../../../internal/services/deployment.js";
import { dnsEncodeName } from "../../../names/dns.js";
import { normalizeName } from "../../../names/normalize.js";
import { getDnsClaimStatus } from "../get-dns-claim-status/index.js";
import type { DnsImportPlan, DnsReadError } from "../types.js";

export type GetDnsImportPlanParameters = { readonly name: string } & BlockParameters;

const getDnsImportPlanEffect = Effect.fn("ensforge.getDnsImportPlan")(function* (
  config: EnsforgeConfig,
  parameters: GetDnsImportPlanParameters,
) {
  const name = yield* normalizeName.effect(parameters.name);

  return yield* executeRead(
    config,
    parameters,
    Effect.gen(function* () {
      const claim = yield* getDnsClaimStatus.effect(config, parameters);

      if (claim.status === "unsupported") return claim;

      const { profile } = yield* DeploymentService;
      const v1 = profile.v1;

      if (v1 === undefined) {
        return {
          status: "unsupported",
          name,
          reason: "DNS_REGISTRAR_UNAVAILABLE",
        } as const;
      }

      const ethereum = yield* EthereumClient;

      const oracle = yield* ethereum.readContract({
        address: v1.contracts.dnsRegistrar,
        abi: dnsRegistrarV1OracleAbi,
        functionName: "oracle",
      });

      if (claim.status === "claimed") {
        return {
          status: "already-claimed",
          name,
          registrar: v1.contracts.dnsRegistrar,
          oracle,
          owner: claim.owner,
          resolver: claim.resolver,
        } satisfies DnsImportPlan;
      }

      return {
        status: "proof-required",
        name,
        registrar: v1.contracts.dnsRegistrar,
        oracle,
        proofRequest: {
          name: yield* dnsEncodeName.effect(name),
          previousInception: claim.previousInception,
        },
      } satisfies DnsImportPlan;
    }),
  );
});

export const getDnsImportPlan = defineReadAction<
  GetDnsImportPlanParameters,
  DnsImportPlan,
  DnsReadError
>(getDnsImportPlanEffect);

export type { DnsImportPlan, DnsReadError as GetDnsImportPlanError } from "../types.js";
