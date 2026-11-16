import { Effect, Schema } from "effect";

import {
  dnsRegistrarV1ProveAndClaimAbi,
  dnsRegistrarV1ProveAndClaimWithResolverAbi,
} from "@ensforge/contracts/internal";
import { encodeFunctionData, zeroAddress } from "viem";

import type { EnsWriteIntentPreparer } from "../../../action/write-intent.js";
import { ContractError } from "../../../errors/contract-error.js";
import { DnsImportError } from "../../../errors/dns-import-error.js";
import { makeSingleWriteAction } from "../../../internal/write/single-write-action.js";
import { dnsEncodeName } from "../../../names/dns.js";
import { normalizeName } from "../../../names/normalize.js";
import type { WriteError } from "../../../write/types.js";
import { decodeOwnershipAddress } from "../../ownership/address.js";
import type { ClaimDnsNameParameters } from "../types.js";
import { DnssecProofChain } from "../types.js";

const prepare: EnsWriteIntentPreparer<ClaimDnsNameParameters, WriteError> = Effect.fn(
  "ensforge.claimDnsName.prepare",
)(function* (config, parameters) {
  const v1 = config.deployments.v1;

  if (v1 === undefined) {
    return yield* new DnsImportError({
      code: "DNS_REGISTRAR_UNAVAILABLE",
      message: "The active deployment does not provide the ENS DNS Registrar",
    });
  }

  const name = yield* normalizeName.effect(parameters.name);

  const proof = yield* Schema.decodeUnknownEffect(DnssecProofChain)(parameters.proof).pipe(
    Effect.mapError(
      () =>
        new DnsImportError({
          code: "INVALID_PROOF",
          message: `A non-empty, hex-encoded DNSSEC proof chain is required for ${name}`,
        }),
    ),
  );

  if (parameters.address !== undefined && parameters.resolver === undefined) {
    return yield* new DnsImportError({
      code: "RESOLVER_REQUIRED",
      message: `A resolver is required when setting an address for ${name}`,
    });
  }

  const resolver =
    parameters.resolver === undefined
      ? null
      : yield* decodeOwnershipAddress(parameters.resolver, "resolver");

  const address =
    parameters.address === undefined
      ? zeroAddress
      : yield* decodeOwnershipAddress(parameters.address, "DNS address record");

  const dnsName = yield* dnsEncodeName.effect(name);

  const data = yield* Effect.try({
    try: () =>
      resolver === null
        ? encodeFunctionData({
            abi: dnsRegistrarV1ProveAndClaimAbi,
            functionName: "proveAndClaim",
            args: [dnsName, proof],
          })
        : encodeFunctionData({
            abi: dnsRegistrarV1ProveAndClaimWithResolverAbi,
            functionName: "proveAndClaimWithResolver",
            args: [dnsName, proof, resolver, address],
          }),
    catch: (cause) =>
      new ContractError({
        code: "ENCODE_FAILED",
        message: `Unable to encode the DNSSEC claim for ${name}`,
        cause,
      }),
  });

  return {
    to: v1.contracts.dnsRegistrar,
    data,
    value: 0n,
    protocol: "v1" as const,
  };
});

export const claimDnsName = makeSingleWriteAction("claimDnsName", prepare);

export type {
  ClaimDnsNameError,
  ClaimDnsNameIntent,
  ClaimDnsNameParameters,
  ClaimDnsNameResult,
} from "../types.js";
