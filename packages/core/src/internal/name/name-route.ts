import { Effect } from "effect";

import {
  ethRenewerV1IsRenewableAbi,
  permissionedRegistryV2InterfaceGetStateAbi,
  universalHelperV2FindParentRegistryAbi,
} from "@ensforge/contracts/internal";
import { universalResolverFindResolverAbi } from "@ensforge/contracts/shared";
import { isAddressEqual, zeroAddress } from "viem";

import type { EnsV1ConfigDeployment, EnsV2ConfigDeployment } from "../../config/custom-network.js";
import type { CodecError } from "../../errors/codec-error.js";
import { ContractError } from "../../errors/contract-error.js";
import { analyzeName } from "../../names/analyze.js";
import { dnsEncodeName } from "../../names/dns.js";
import { labelhash } from "../../names/hashes.js";
import type { NormalizedName } from "../../schemas/name.js";
import { EthereumClient } from "../client/ethereum-client.js";
import type { ViemError } from "../errors/viem-error.js";
import type { ReadContext } from "../read/execution-context.js";
import { DeploymentService } from "../services/deployment.js";

export interface V1NameRoute {
  readonly kind: "v1";
  readonly protocol: "v1";
  readonly deployment: EnsV1ConfigDeployment;
}

interface V2RouteFields {
  readonly protocol: "v2";
  readonly deployment: EnsV2ConfigDeployment;
  readonly label: string;
  readonly parentRegistry: `0x${string}`;
  readonly state: {
    readonly status: number;
    readonly expiry: bigint;
    readonly latestOwner: `0x${string}`;
    readonly tokenId: bigint;
    readonly resource: bigint;
  };
}

export interface V2NameRoute extends V2RouteFields {
  readonly kind: "v2";
}

export interface AvailableNameRoute extends V2RouteFields {
  readonly kind: "available";
}

export interface ReservedNameRoute {
  readonly kind: "reserved";
  readonly protocol: "v1";
  readonly deployment: EnsV2ConfigDeployment;
  readonly v1: EnsV1ConfigDeployment;
  readonly label: string;
  readonly parentRegistry: `0x${string}`;
  readonly state: V2NameRoute["state"];
}

export type NameRoute = V1NameRoute | V2NameRoute | AvailableNameRoute | ReservedNameRoute;

export const readNameRoute = Effect.fn("readNameRoute")(function* (
  name: NormalizedName,
): Effect.fn.Return<
  NameRoute,
  CodecError | ContractError | ViemError,
  DeploymentService | EthereumClient | ReadContext
> {
  const deployments = yield* DeploymentService;

  if (deployments.profile.protocol === "v1") {
    return { kind: "v1", protocol: "v1", deployment: deployments.profile.v1 };
  }

  const deployment = deployments.profile.v2;
  const v1 = deployments.profile.v1;
  const analysis = analyzeName(name);

  if (analysis.label === undefined) {
    return v1 === undefined
      ? {
          kind: "available",
          protocol: "v2",
          deployment,
          label: "",
          parentRegistry: deployment.contracts.rootRegistry,
          state: { status: 0, expiry: 0n, latestOwner: zeroAddress, tokenId: 0n, resource: 0n },
        }
      : { kind: "v1", protocol: "v1", deployment: v1 };
  }

  const ethereum = yield* EthereumClient;
  const dnsName = yield* dnsEncodeName.effect(name);

  const parentRegistry = yield* ethereum.readContract({
    address: deployment.contracts.universalHelper,
    abi: universalHelperV2FindParentRegistryAbi,
    functionName: "findParentRegistry",
    args: [dnsName],
  });

  if (isAddressEqual(parentRegistry, zeroAddress)) {
    return v1 === undefined
      ? {
          kind: "available",
          protocol: "v2",
          deployment,
          label: analysis.label,
          parentRegistry: deployment.contracts.rootRegistry,
          state: { status: 0, expiry: 0n, latestOwner: zeroAddress, tokenId: 0n, resource: 0n },
        }
      : { kind: "v1", protocol: "v1", deployment: v1 };
  }

  const state = yield* ethereum.readContract({
    address: parentRegistry,
    abi: permissionedRegistryV2InterfaceGetStateAbi,
    functionName: "getState",
    args: [BigInt(labelhash(analysis.label))],
  });

  if (state.status !== 0 && state.status !== 1 && state.status !== 2) {
    return yield* new ContractError({
      code: "DECODE_FAILED",
      message: "Unknown ENSv2 registry status",
      cause: state,
    });
  }

  const secondLevelLabel = analysis.ethSecondLevelLabel;

  const shouldCheckReservedRenewal =
    state.status === 0 && isAddressEqual(state.latestOwner, zeroAddress);

  const reservedRenewable =
    secondLevelLabel === undefined || !shouldCheckReservedRenewal
      ? false
      : yield* ethereum.readContract({
          address: deployment.migration.ethRenewerV1,
          abi: ethRenewerV1IsRenewableAbi,
          functionName: "isRenewable",
          args: [secondLevelLabel],
        });

  if ((state.status === 1 || (state.status === 0 && reservedRenewable)) && v1 !== undefined) {
    return {
      kind: "reserved",
      protocol: "v1",
      deployment,
      v1,
      label: analysis.label,
      parentRegistry,
      state,
    };
  }

  if (state.status !== 2 && isAddressEqual(state.latestOwner, zeroAddress) && v1 !== undefined) {
    const [resolver] = yield* ethereum.readContract({
      address: deployment.contracts.universalResolver,
      abi: universalResolverFindResolverAbi,
      functionName: "findResolver",
      args: [dnsName],
    });

    if (isAddressEqual(resolver, deployment.migration.ensV1Resolver)) {
      return { kind: "v1", protocol: "v1", deployment: v1 };
    }
  }

  return {
    kind: state.status === 0 && isAddressEqual(state.latestOwner, zeroAddress) ? "available" : "v2",
    protocol: "v2",
    deployment,
    label: analysis.label,
    parentRegistry,
    state,
  };
});
