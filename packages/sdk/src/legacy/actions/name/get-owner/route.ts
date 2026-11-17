import { Effect, Result } from "effect";

import {
  ethRegistryV2GetStateAbi,
  ethRenewerV1IsRenewableAbi,
  universalHelperV2FindExactOwnerAbi,
  universalHelperV2FindParentRegistryAbi,
  universalResolverV2FindResolverAbi,
} from "@ensforge/contracts/internal";
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
import type { OwnerResult } from "./types.js";
import { interpretV1Owner, readV1Owner } from "./v1.js";

const routeEthOwner = Effect.fn("routeEthOwner")(function* (
  name: NormalizedName,
  label: string,
  v1: EnsV1ConfigDeployment,
  v2: EnsV2ConfigDeployment,
): Effect.fn.Return<
  OwnerResult | null,
  CodecError | ContractError | ViemError,
  EthereumClient | ReadContext
> {
  const ethereum = yield* EthereumClient;
  const dnsName = yield* dnsEncodeName.effect(name);
  const ownerId = BigInt(labelhash(label));

  const [ownerResult, stateResult, renewableResult, v1Results] = yield* Effect.all(
    [
      Effect.result(
        ethereum.readContract({
          address: v2.contracts.universalHelper,
          abi: universalHelperV2FindExactOwnerAbi,
          functionName: "findExactOwner",
          args: [dnsName],
        }),
      ),
      Effect.result(
        ethereum.readContract({
          address: v2.contracts.ethRegistry,
          abi: ethRegistryV2GetStateAbi,
          functionName: "getState",
          args: [ownerId],
        }),
      ),
      Effect.result(
        ethereum.readContract({
          address: v2.migration.ethRenewerV1,
          abi: ethRenewerV1IsRenewableAbi,
          functionName: "isRenewable",
          args: [label],
        }),
      ),
      readV1Owner(name, v1),
    ] as const,
    { concurrency: "unbounded" },
  );

  if (Result.isFailure(ownerResult)) return yield* ownerResult.failure;

  if (!isAddressEqual(ownerResult.success, zeroAddress)) {
    return {
      name,
      owner: ownerResult.success,
      registrant: null,
      protocol: "v2",
      ownershipLevel: "registry",
    };
  }

  if (Result.isFailure(stateResult)) return yield* stateResult.failure;

  if (Result.isFailure(renewableResult)) return yield* renewableResult.failure;

  const state = stateResult.success;
  const renewable = renewableResult.success;

  if (state.status === 2 || !isAddressEqual(state.latestOwner, zeroAddress)) return null;

  if (state.status !== 1 && state.status !== 0) {
    return yield* new ContractError({
      code: "DECODE_FAILED",
      message: "Unknown ENSv2 ETH registry status",
      cause: state,
    });
  }

  if (state.status === 0 && !renewable) return null;

  return yield* interpretV1Owner(name, v1, v1Results);
});

const routeOtherOwner = Effect.fn("routeOtherOwner")(function* (
  name: NormalizedName,
  v1: EnsV1ConfigDeployment,
  v2: EnsV2ConfigDeployment,
): Effect.fn.Return<
  OwnerResult | null,
  CodecError | ContractError | ViemError,
  EthereumClient | ReadContext
> {
  const ethereum = yield* EthereumClient;
  const dnsName = yield* dnsEncodeName.effect(name);

  const [ownerResult, parentResult, resolverResult, v1Results] = yield* Effect.all(
    [
      Effect.result(
        ethereum.readContract({
          address: v2.contracts.universalHelper,
          abi: universalHelperV2FindExactOwnerAbi,
          functionName: "findExactOwner",
          args: [dnsName],
        }),
      ),
      Effect.result(
        ethereum.readContract({
          address: v2.contracts.universalHelper,
          abi: universalHelperV2FindParentRegistryAbi,
          functionName: "findParentRegistry",
          args: [dnsName],
        }),
      ),
      Effect.result(
        ethereum.readContract({
          address: v2.contracts.universalResolver,
          abi: universalResolverV2FindResolverAbi,
          functionName: "findResolver",
          args: [dnsName],
        }),
      ),
      readV1Owner(name, v1),
    ] as const,
    { concurrency: "unbounded" },
  );

  if (Result.isFailure(ownerResult)) return yield* ownerResult.failure;

  if (!isAddressEqual(ownerResult.success, zeroAddress)) {
    return {
      name,
      owner: ownerResult.success,
      registrant: null,
      protocol: "v2",
      ownershipLevel: "registry",
    };
  }

  if (Result.isFailure(parentResult)) return yield* parentResult.failure;

  if (Result.isFailure(resolverResult)) return yield* resolverResult.failure;

  const [resolver] = resolverResult.success;
  const usesV1Mirror = isAddressEqual(resolver, v2.migration.ensV1Resolver);
  const hasV2ParentRegistry = !isAddressEqual(parentResult.success, zeroAddress);

  if (!usesV1Mirror && hasV2ParentRegistry) return null;

  return yield* interpretV1Owner(name, v1, v1Results);
});

export const routeOwner = Effect.fn("routeOwner")(function* (
  name: NormalizedName,
  v1: EnsV1ConfigDeployment,
  v2: EnsV2ConfigDeployment,
): Effect.fn.Return<
  OwnerResult | null,
  CodecError | ContractError | ViemError,
  EthereumClient | ReadContext
> {
  const secondLevelLabel = analyzeName(name).ethSecondLevelLabel;

  return secondLevelLabel === undefined
    ? yield* routeOtherOwner(name, v1, v2)
    : yield* routeEthOwner(name, secondLevelLabel, v1, v2);
});
