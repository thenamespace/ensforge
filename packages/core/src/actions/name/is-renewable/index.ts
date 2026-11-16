import { Effect } from "effect";

import {
  baseRegistrarV1AvailableAbi,
  ethRegistrarV2IsRenewableAbi,
  ethRenewerV1IsRenewableAbi,
} from "@ensforge/contracts/internal";

import { defineReadAction } from "../../../action/read-request.js";
import type { EnsforgeConfig } from "../../../config/config.js";
import { EthereumClient } from "../../../internal/client/ethereum-client.js";
import { readNameRoute } from "../../../internal/name/name-route.js";
import { executeRead } from "../../../internal/read/execute-read.js";
import { analyzeName } from "../../../names/analyze.js";
import { labelhash } from "../../../names/hashes.js";
import { normalizeName } from "../../../names/normalize.js";
import type { GetNameStateError, GetNameStateParameters } from "../get-name-state/types.js";

const isRenewableEffect = Effect.fn("ensforge.isRenewable")(function* (
  config: EnsforgeConfig,
  parameters: GetNameStateParameters,
) {
  const name = yield* normalizeName.effect(parameters.name);

  return yield* executeRead(
    config,
    parameters,
    Effect.gen(function* () {
      const route = yield* readNameRoute(name);
      const analysis = analyzeName(name);
      const label = analysis.ethSecondLevelLabel;

      if (label === undefined) return false;

      const ethereum = yield* EthereumClient;

      if (route.kind === "reserved") {
        return yield* ethereum.readContract({
          address: route.deployment.migration.ethRenewerV1,
          abi: ethRenewerV1IsRenewableAbi,
          functionName: "isRenewable",
          args: [label],
        });
      }

      if (route.kind === "v2" || route.kind === "available") {
        return yield* ethereum.readContract({
          address: route.deployment.contracts.ethRegistrar,
          abi: ethRegistrarV2IsRenewableAbi,
          functionName: "isRenewable",
          args: [label],
        });
      }

      const available = yield* ethereum.readContract({
        address: route.deployment.contracts.baseRegistrar,
        abi: baseRegistrarV1AvailableAbi,
        functionName: "available",
        args: [BigInt(labelhash(label))],
      });

      return !available;
    }),
  );
});

export const isRenewable = defineReadAction<GetNameStateParameters, boolean, GetNameStateError>(
  isRenewableEffect,
);

export type {
  GetNameStateError as IsRenewableError,
  GetNameStateParameters as IsRenewableParameters,
} from "../get-name-state/types.js";
