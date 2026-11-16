import { Effect, Result } from "effect";

import {
  baseRegistrarV1OwnerOfAbi,
  ensRegistryV1OwnerAbi,
  nameWrapperV1OwnerOfAbi,
} from "@ensforge/contracts/internal";
import {
  BaseError,
  ContractFunctionRevertedError,
  isAddressEqual,
  zeroAddress,
  type Address,
} from "viem";

import type { EnsV1ConfigDeployment } from "../../../config/custom-network.js";
import { ContractError } from "../../../errors/contract-error.js";
import { EthereumClient } from "../../../internal/client/ethereum-client.js";
import type { ViemError } from "../../../internal/errors/viem-error.js";
import type { ReadContext } from "../../../internal/read/execution-context.js";
import { analyzeName } from "../../../names/analyze.js";
import { labelhash, namehash } from "../../../names/hashes.js";
import type { NormalizedName } from "../../../schemas/name.js";
import type { OwnerResult } from "./types.js";

type OwnerCallResult = Result.Result<Address, ViemError>;

export const readV1Owner = Effect.fn("readV1Owner")(function* (
  name: NormalizedName,
  deployment: EnsV1ConfigDeployment,
): Effect.fn.Return<readonly OwnerCallResult[], never, EthereumClient | ReadContext> {
  const ethereum = yield* EthereumClient;
  const analysis = analyzeName(name);
  const node = namehash(name);

  const reads: Array<Effect.Effect<OwnerCallResult, never, ReadContext>> = [
    Effect.result(
      ethereum.readContract({
        address: deployment.contracts.registry,
        abi: ensRegistryV1OwnerAbi,
        functionName: "owner",
        args: [node],
      }),
    ),
    Effect.result(
      ethereum.readContract({
        address: deployment.contracts.nameWrapper,
        abi: nameWrapperV1OwnerOfAbi,
        functionName: "ownerOf",
        args: [BigInt(node)],
      }),
    ),
  ];

  if (analysis.isSecondLevelEth && analysis.label !== undefined) {
    reads.push(
      Effect.result(
        ethereum.readContract({
          address: deployment.contracts.baseRegistrar,
          abi: baseRegistrarV1OwnerOfAbi,
          functionName: "ownerOf",
          args: [BigInt(labelhash(analysis.label))],
        }),
      ),
    );
  }

  return yield* Effect.all(reads, { concurrency: "unbounded" });
});

export const interpretV1Owner = Effect.fn("interpretV1Owner")(function* (
  name: NormalizedName,
  deployment: EnsV1ConfigDeployment,
  results: readonly OwnerCallResult[],
): Effect.fn.Return<OwnerResult | null, ContractError | ViemError> {
  const registryResult = results[0];

  if (registryResult === undefined) {
    return yield* new ContractError({
      code: "DECODE_FAILED",
      message: "Missing ENS registry ownership result",
      cause: registryResult,
    });
  }

  if (Result.isFailure(registryResult)) return yield* registryResult.failure;

  const registryOwner: Address | null = isAddressEqual(registryResult.success, zeroAddress)
    ? null
    : registryResult.success;

  const wrapperResult = results[1];

  if (wrapperResult === undefined) {
    return yield* new ContractError({
      code: "DECODE_FAILED",
      message: "Missing Name Wrapper ownership result",
      cause: wrapperResult,
    });
  }

  if (Result.isFailure(wrapperResult)) return yield* wrapperResult.failure;

  const nameWrapperOwner: Address | null = isAddressEqual(wrapperResult.success, zeroAddress)
    ? null
    : wrapperResult.success;

  const analysis = analyzeName(name);
  let registrarOwner: Address | null = null;

  if (analysis.isSecondLevelEth) {
    const registrarResult = results[2];

    if (registrarResult === undefined) {
      return yield* new ContractError({
        code: "DECODE_FAILED",
        message: "Missing ETH registrar ownership result",
        cause: registrarResult,
      });
    }

    if (Result.isFailure(registrarResult)) {
      const cause = registrarResult.failure.cause;

      const missingToken =
        cause instanceof BaseError &&
        cause.walk((error) => error instanceof ContractFunctionRevertedError) !== null;

      if (!missingToken) return yield* registrarResult.failure;
    } else {
      registrarOwner = isAddressEqual(registrarResult.success, zeroAddress)
        ? null
        : registrarResult.success;
    }
  }

  if (analysis.isEth) {
    if (
      registrarOwner !== null &&
      isAddressEqual(registrarOwner, deployment.contracts.nameWrapper)
    ) {
      return nameWrapperOwner === null
        ? null
        : {
            name,
            owner: nameWrapperOwner,
            registrant: null,
            protocol: "v1",
            ownershipLevel: "nameWrapper",
          };
    }

    if (registrarOwner !== null) {
      return {
        name,
        owner: registryOwner,
        registrant: registrarOwner,
        protocol: "v1",
        ownershipLevel: "registrar",
      };
    }

    if (registryOwner === null) return null;

    if (analysis.isSecondLevelEth) {
      return {
        name,
        owner: registryOwner,
        registrant: null,
        protocol: "v1",
        ownershipLevel: "registrar",
      };
    }

    if (
      isAddressEqual(registryOwner, deployment.contracts.nameWrapper) &&
      nameWrapperOwner !== null
    ) {
      return {
        name,
        owner: nameWrapperOwner,
        registrant: null,
        protocol: "v1",
        ownershipLevel: "nameWrapper",
      };
    }

    return {
      name,
      owner: registryOwner,
      registrant: null,
      protocol: "v1",
      ownershipLevel: "registry",
    };
  }

  if (
    registryOwner !== null &&
    isAddressEqual(registryOwner, deployment.contracts.nameWrapper) &&
    nameWrapperOwner !== null
  ) {
    return {
      name,
      owner: nameWrapperOwner,
      registrant: null,
      protocol: "v1",
      ownershipLevel: "nameWrapper",
    };
  }

  return registryOwner === null
    ? null
    : {
        name,
        owner: registryOwner,
        registrant: null,
        protocol: "v1",
        ownershipLevel: "registry",
      };
});

export const getOwnerV1 = Effect.fn("getOwnerV1")(function* (
  name: NormalizedName,
  deployment: EnsV1ConfigDeployment,
): Effect.fn.Return<OwnerResult | null, ContractError | ViemError, EthereumClient | ReadContext> {
  const results = yield* readV1Owner(name, deployment);

  return yield* interpretV1Owner(name, deployment, results);
});
