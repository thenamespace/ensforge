import { Effect, Option } from "effect";

import {
  ensRegistryV1IsApprovedForAllAbi,
  contractNamerV2InterfaceIsContractNamerAbi,
} from "@ensforge/contracts/internal";
import { isAddressEqual, type Address } from "viem";

import type { EnsforgeConfig } from "../../config/config.js";
import { AuthorizationError } from "../../errors/authorization-error.js";
import { viemErrorToEffectError } from "../../internal/errors/viem-error.js";

const ownableAbi = [
  {
    type: "function",
    name: "owner",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "address" }],
  },
] as const;

const getContractCode = Effect.fn("ensforge.reverse.getContractCode")(function* (
  config: EnsforgeConfig,
  address: Address,
) {
  return yield* Effect.tryPromise({
    try: () => config.publicClient.getBytecode({ address }),
    catch: (cause) => viemErrorToEffectError(cause, "readContract"),
  });
});

export const requireContract = Effect.fn("ensforge.reverse.requireContract")(function* (
  config: EnsforgeConfig,
  address: Address,
) {
  const code = yield* getContractCode(config, address);

  return code !== undefined && code !== "0x";
});

const isOwnedContract = Effect.fn("ensforge.reverse.isOwnedContract")(function* (
  config: EnsforgeConfig,
  target: Address,
  caller: Address,
) {
  const code = yield* getContractCode(config, target);

  if (code === undefined || code === "0x") return false;

  const owner = yield* Effect.tryPromise(() =>
    config.publicClient.readContract({ address: target, abi: ownableAbi, functionName: "owner" }),
  ).pipe(Effect.option);

  return Option.isSome(owner) && isAddressEqual(owner.value, caller);
});

export const requireReverseAuthorization = Effect.fn("ensforge.reverse.requireAuthorization")(
  function* (config: EnsforgeConfig, target: Address, caller: Address) {
    if (isAddressEqual(target, caller)) return;

    if (config.deployments.protocol === "v1") {
      const registry = config.deployments.v1.contracts.registry;

      const [approved, ownsContract] = yield* Effect.all(
        [
          Effect.tryPromise({
            try: () =>
              config.publicClient.readContract({
                address: registry,
                abi: ensRegistryV1IsApprovedForAllAbi,
                functionName: "isApprovedForAll",
                args: [target, caller],
              }),
            catch: (cause) => viemErrorToEffectError(cause, "readContract"),
          }),
          isOwnedContract(config, target, caller),
        ] as const,
        { concurrency: "unbounded" },
      );

      if (approved || ownsContract) return;
    } else {
      const [ownsContract, namedByContract] = yield* Effect.all(
        [
          isOwnedContract(config, target, caller),
          Effect.tryPromise(() =>
            config.publicClient.readContract({
              address: target,
              abi: contractNamerV2InterfaceIsContractNamerAbi,
              functionName: "isContractNamer",
              args: [caller],
            }),
          ).pipe(Effect.option),
        ] as const,
        { concurrency: "unbounded" },
      );

      if (ownsContract || (Option.isSome(namedByContract) && namedByContract.value)) return;
    }

    return yield* new AuthorizationError({
      code: "UNAUTHORIZED",
      message: `${caller} is not authorized to set the primary name for ${target}`,
    });
  },
);
