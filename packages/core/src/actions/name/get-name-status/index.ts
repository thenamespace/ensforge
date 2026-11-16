import { Effect } from "effect";

import { ethRegistrarV2IsRenewableAbi } from "@ensforge/contracts/internal";

import { defineReadAction } from "../../../action/read-request.js";
import type { EnsforgeConfig } from "../../../config/config.js";
import { EthereumClient } from "../../../internal/client/ethereum-client.js";
import { readNameRoute } from "../../../internal/name/name-route.js";
import { readBlockTimestamp } from "../../../internal/read/block-timestamp.js";
import { executeRead } from "../../../internal/read/execute-read.js";
import { analyzeName } from "../../../names/analyze.js";
import { normalizeName } from "../../../names/normalize.js";
import { getExpiry } from "../get-expiry/index.js";
import type {
  GetNameStateError,
  GetNameStateParameters,
  NameStatus,
} from "../get-name-state/types.js";
import { getOwner } from "../get-owner/index.js";

const getNameStatusEffect = Effect.fn("ensforge.getNameStatus")(function* (
  config: EnsforgeConfig,
  parameters: GetNameStateParameters,
) {
  const name = yield* normalizeName.effect(parameters.name);

  return yield* executeRead(
    config,
    parameters,
    Effect.gen(function* () {
      const route = yield* readNameRoute(name);

      if (route.kind === "reserved") return route.state.status === 1 ? "reserved" : "grace";

      if (route.kind === "available" && route.state.expiry === 0n) return "available";

      if (route.kind === "v2") {
        if (route.state.status === 2) return "active";

        if (analyzeName(name).ethSecondLevelLabel === undefined) {
          return route.state.status === 0 ? "available" : "expired";
        }

        const renewable = yield* (yield* EthereumClient).readContract({
          address: route.deployment.contracts.ethRegistrar,
          abi: ethRegistrarV2IsRenewableAbi,
          functionName: "isRenewable",
          args: [route.label],
        });

        return renewable ? "grace" : "expired";
      }

      const expiry = yield* getExpiry.effect(config, parameters);

      if (expiry === null) {
        const owner = yield* getOwner.effect(config, parameters);

        return owner === null ? "available" : "active";
      }

      const timestamp = yield* readBlockTimestamp();

      if (timestamp <= expiry.expiry) return "active";

      return timestamp <= expiry.gracePeriodEnd ? "grace" : "expired";
    }),
  );
});

export const getNameStatus = defineReadAction<
  GetNameStateParameters,
  NameStatus,
  GetNameStateError
>(getNameStatusEffect);

export type {
  GetNameStateError as GetNameStatusError,
  GetNameStateParameters as GetNameStatusParameters,
  NameStatus as GetNameStatusResult,
} from "../get-name-state/types.js";
