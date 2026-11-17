import { Effect, Result } from "effect";

import {
  getExpiryV1RegistrarAbi,
  getExpiryV2EthRegistryAbi,
  getExpiryV2GracePeriodAbi,
  getExpiryV2TemporalRegistryAbi,
  getExpiryV2UniversalResolverAbi,
} from "@ensforge/contracts/internal";
import { universalResolverFindResolverAbi } from "@ensforge/contracts/shared";
import { isAddressEqual, zeroAddress } from "viem";

import type {
  EnsV1ConfigDeployment,
  EnsV2ConfigDeployment,
} from "../../../config/custom-network.js";
import type { CodecError } from "../../../errors/codec-error.js";
import { ContractError } from "../../../errors/contract-error.js";
import { EthereumClient } from "../../../internal/client/ethereum-client.js";
import type { ViemError } from "../../../internal/errors/viem-error.js";
import type { ReadContext } from "../../../internal/read/execution-context.js";
import { analyzeName } from "../../../names/analyze.js";
import { dnsEncodeName } from "../../../names/dns.js";
import { labelhash } from "../../../names/hashes.js";
import type { NormalizedName } from "../../../schemas/name.js";
import type { ExpiryResult } from "./types.js";
import { getExpiryV1 } from "./v1.js";

const routeEthExpiry = Effect.fn("routeEthExpiry")(function* (
  name: NormalizedName,
  label: string,
  v1: EnsV1ConfigDeployment,
  v2: EnsV2ConfigDeployment,
): Effect.fn.Return<ExpiryResult | null, ContractError | ViemError, EthereumClient | ReadContext> {
  const ethereum = yield* EthereumClient;
  const labelId = BigInt(labelhash(label));

  const [stateResult, v2GraceResult, v1ExpiryResult, v1GraceResult] = yield* Effect.all(
    [
      Effect.result(
        ethereum.readContract({
          address: v2.contracts.ethRegistry,
          abi: getExpiryV2EthRegistryAbi,
          functionName: "getState",
          args: [labelId],
        }),
      ),
      Effect.result(
        ethereum.readContract({
          address: v2.contracts.ethRegistrar,
          abi: getExpiryV2GracePeriodAbi,
          functionName: "GRACE_PERIOD",
        }),
      ),
      Effect.result(
        ethereum.readContract({
          address: v1.contracts.baseRegistrar,
          abi: getExpiryV1RegistrarAbi,
          functionName: "nameExpires",
          args: [labelId],
        }),
      ),
      Effect.result(
        ethereum.readContract({
          address: v2.migration.ethRenewerV1,
          abi: getExpiryV2GracePeriodAbi,
          functionName: "GRACE_PERIOD",
        }),
      ),
    ] as const,
    { concurrency: "unbounded" },
  );

  if (Result.isFailure(stateResult)) return yield* stateResult.failure;

  const state = stateResult.success;

  if (state.status !== 0 && state.status !== 1 && state.status !== 2) {
    return yield* new ContractError({
      code: "DECODE_FAILED",
      message: "Unknown ENSv2 ETH registry status",
      cause: state,
    });
  }

  const isV2Registration = state.status === 2 || !isAddressEqual(state.latestOwner, zeroAddress);

  if (isV2Registration) {
    if (state.expiry === 0n) return null;

    if (Result.isFailure(v2GraceResult)) return yield* v2GraceResult.failure;

    return {
      name,
      expiry: state.expiry,
      gracePeriod: v2GraceResult.success,
      gracePeriodEnd: state.expiry + v2GraceResult.success,
      protocol: "v2",
      source: "registry",
    };
  }

  if (Result.isFailure(v1ExpiryResult)) return yield* v1ExpiryResult.failure;

  if (v1ExpiryResult.success !== 0n) {
    if (Result.isFailure(v1GraceResult)) return yield* v1GraceResult.failure;

    return {
      name,
      expiry: v1ExpiryResult.success,
      gracePeriod: v1GraceResult.success,
      gracePeriodEnd: v1ExpiryResult.success + v1GraceResult.success,
      protocol: "v1",
      source: "baseRegistrar",
    };
  }

  if (state.expiry === 0n) return null;

  if (Result.isFailure(v2GraceResult)) return yield* v2GraceResult.failure;

  return {
    name,
    expiry: state.expiry,
    gracePeriod: v2GraceResult.success,
    gracePeriodEnd: state.expiry + v2GraceResult.success,
    protocol: "v2",
    source: "registry",
  };
});

const routeOtherExpiry = Effect.fn("routeOtherExpiry")(function* (
  name: NormalizedName,
  v1: EnsV1ConfigDeployment,
  v2: EnsV2ConfigDeployment,
): Effect.fn.Return<ExpiryResult | null, CodecError | ViemError, EthereumClient | ReadContext> {
  const ethereum = yield* EthereumClient;
  const analysis = analyzeName(name);

  if (analysis.label === undefined) return null;

  const dnsName = yield* dnsEncodeName.effect(name);

  const [parentResult, resolverResult, v1Result] = yield* Effect.all(
    [
      Effect.result(
        ethereum.readContract({
          address: v2.contracts.universalHelper,
          abi: getExpiryV2UniversalResolverAbi,
          functionName: "findParentRegistry",
          args: [dnsName],
        }),
      ),
      Effect.result(
        ethereum.readContract({
          address: v2.contracts.universalResolver,
          abi: universalResolverFindResolverAbi,
          functionName: "findResolver",
          args: [dnsName],
        }),
      ),
      Effect.result(getExpiryV1(name, v1)),
    ] as const,
    { concurrency: "unbounded" },
  );

  if (Result.isFailure(parentResult)) return yield* parentResult.failure;

  if (Result.isFailure(resolverResult)) return yield* resolverResult.failure;

  const [resolver] = resolverResult.success;
  const usesV1Mirror = isAddressEqual(resolver, v2.migration.ensV1Resolver);

  if (isAddressEqual(parentResult.success, zeroAddress) || usesV1Mirror) {
    return Result.isFailure(v1Result) ? yield* v1Result.failure : v1Result.success;
  }

  const expiry = yield* ethereum.readContract({
    address: parentResult.success,
    abi: getExpiryV2TemporalRegistryAbi,
    functionName: "findExpiry",
    args: [analysis.label],
  });

  return expiry === 0n
    ? null
    : {
        name,
        expiry,
        gracePeriod: 0n,
        gracePeriodEnd: expiry,
        protocol: "v2",
        source: "registry",
      };
});

export const routeExpiry = Effect.fn("routeExpiry")(function* (
  name: NormalizedName,
  v1: EnsV1ConfigDeployment,
  v2: EnsV2ConfigDeployment,
): Effect.fn.Return<
  ExpiryResult | null,
  CodecError | ContractError | ViemError,
  EthereumClient | ReadContext
> {
  const analysis = analyzeName(name);
  const secondLevelLabel = analysis.isSecondLevelEth ? analysis.label : undefined;

  return secondLevelLabel === undefined
    ? yield* routeOtherExpiry(name, v1, v2)
    : yield* routeEthExpiry(name, secondLevelLabel, v1, v2);
});
