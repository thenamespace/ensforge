import { Effect } from "effect";

import {
  dnsRegistrarV1InceptionsAbi,
  ensRegistryV1OwnerAbi,
  ensRegistryV1ResolverAbi,
} from "@ensforge/contracts/internal";
import { isAddressEqual, zeroAddress } from "viem";

import type { BlockParameters } from "../../../action/block.js";
import { defineReadAction } from "../../../action/read-request.js";
import type { EnsforgeConfig } from "../../../config/config.js";
import { EthereumClient } from "../../../internal/client/ethereum-client.js";
import { executeRead } from "../../../internal/read/execute-read.js";
import { DeploymentService } from "../../../internal/services/deployment.js";
import { namehash } from "../../../names/hashes.js";
import { normalizeName } from "../../../names/normalize.js";
import type { DnsClaimStatus, DnsReadError } from "../types.js";

export type GetDnsClaimStatusParameters = { readonly name: string } & BlockParameters;

const getDnsClaimStatusEffect = Effect.fn("ensforge.getDnsClaimStatus")(function* (
  config: EnsforgeConfig,
  parameters: GetDnsClaimStatusParameters,
) {
  const name = yield* normalizeName.effect(parameters.name);

  return yield* executeRead(
    config,
    parameters,
    Effect.gen(function* () {
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
      const node = namehash(name);

      const [owner, resolver, inception] = yield* Effect.all(
        [
          ethereum.readContract({
            address: v1.contracts.registry,
            abi: ensRegistryV1OwnerAbi,
            functionName: "owner",
            args: [node],
          }),
          ethereum.readContract({
            address: v1.contracts.registry,
            abi: ensRegistryV1ResolverAbi,
            functionName: "resolver",
            args: [node],
          }),
          ethereum.readContract({
            address: v1.contracts.dnsRegistrar,
            abi: dnsRegistrarV1InceptionsAbi,
            functionName: "inceptions",
            args: [node],
          }),
        ] as const,
        { concurrency: "unbounded" },
      );

      const previousInception = BigInt(inception);

      return isAddressEqual(owner, zeroAddress)
        ? ({ status: "proof-required", name, previousInception } as const)
        : ({
            status: "claimed",
            name,
            owner,
            resolver: isAddressEqual(resolver, zeroAddress) ? null : resolver,
            previousInception,
          } as const);
    }),
  );
});

export const getDnsClaimStatus = defineReadAction<
  GetDnsClaimStatusParameters,
  DnsClaimStatus,
  DnsReadError
>(getDnsClaimStatusEffect);

export type { DnsClaimStatus, DnsReadError as GetDnsClaimStatusError } from "../types.js";
