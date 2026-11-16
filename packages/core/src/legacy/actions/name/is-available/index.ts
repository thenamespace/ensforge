import { Effect } from "effect";

import {
  baseRegistrarV1AvailableAbi,
  ensRegistryV1OwnerAbi,
  ethRegistrarV2IsAvailableAbi,
} from "@ensforge/contracts/internal";
import { isAddressEqual, zeroAddress } from "viem";

import { defineReadAction } from "../../../action/read-request.js";
import type { EnsforgeConfig } from "../../../config/config.js";
import { EthereumClient } from "../../../internal/client/ethereum-client.js";
import { readNameRoute } from "../../../internal/name/name-route.js";
import { executeRead } from "../../../internal/read/execute-read.js";
import { analyzeName } from "../../../names/analyze.js";
import { labelhash, namehash } from "../../../names/hashes.js";
import { normalizeName } from "../../../names/normalize.js";
import type { GetNameStateError, GetNameStateParameters } from "../get-name-state/types.js";

const isAvailableEffect = Effect.fn("ensforge.isAvailable")(function* (
  config: EnsforgeConfig,
  parameters: GetNameStateParameters,
) {
  const name = yield* normalizeName.effect(parameters.name);

  return yield* executeRead(
    config,
    parameters,
    Effect.gen(function* () {
      const route = yield* readNameRoute(name);

      if (route.kind === "reserved") return false;

      const analysis = analyzeName(name);
      const ethereum = yield* EthereumClient;

      if (route.kind === "v2" || route.kind === "available") {
        return analysis.ethSecondLevelLabel === undefined
          ? route.kind === "available" || route.state.status === 0
          : yield* ethereum.readContract({
              address: route.deployment.contracts.ethRegistrar,
              abi: ethRegistrarV2IsAvailableAbi,
              functionName: "isAvailable",
              args: [analysis.ethSecondLevelLabel],
            });
      }

      if (analysis.isSecondLevelEth && analysis.label !== undefined) {
        return yield* ethereum.readContract({
          address: route.deployment.contracts.baseRegistrar,
          abi: baseRegistrarV1AvailableAbi,
          functionName: "available",
          args: [BigInt(labelhash(analysis.label))],
        });
      }

      const owner = yield* ethereum.readContract({
        address: route.deployment.contracts.registry,
        abi: ensRegistryV1OwnerAbi,
        functionName: "owner",
        args: [namehash(name)],
      });

      return isAddressEqual(owner, zeroAddress);
    }),
  );
});

export const isAvailable = defineReadAction<GetNameStateParameters, boolean, GetNameStateError>(
  isAvailableEffect,
);

export type {
  GetNameStateError as IsAvailableError,
  GetNameStateParameters as IsAvailableParameters,
} from "../get-name-state/types.js";
