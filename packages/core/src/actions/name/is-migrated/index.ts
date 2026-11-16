import { Effect } from "effect";

import { permissionedRegistryV2InterfaceRolesAbi } from "@ensforge/contracts/internal";
import { registryRoles } from "@ensforge/contracts/v2";
import { isAddressEqual, zeroAddress } from "viem";

import { defineReadAction } from "../../../action/read-request.js";
import type { EnsforgeConfig } from "../../../config/config.js";
import { EthereumClient } from "../../../internal/client/ethereum-client.js";
import { readNameRoute } from "../../../internal/name/name-route.js";
import { executeRead } from "../../../internal/read/execute-read.js";
import { normalizeName } from "../../../names/normalize.js";
import type { GetNameStateError, GetNameStateParameters } from "../get-name-state/types.js";

const isMigratedEffect = Effect.fn("ensforge.isMigrated")(function* (
  config: EnsforgeConfig,
  parameters: GetNameStateParameters,
) {
  const name = yield* normalizeName.effect(parameters.name);

  return yield* executeRead(
    config,
    parameters,
    Effect.gen(function* () {
      const route = yield* readNameRoute(name);

      if (route.kind !== "v2" || isAddressEqual(route.state.latestOwner, zeroAddress)) return false;

      const ethereum = yield* EthereumClient;

      const roles = yield* ethereum.readContract({
        address: route.parentRegistry,
        abi: permissionedRegistryV2InterfaceRolesAbi,
        functionName: "roles",
        args: [route.state.resource, route.state.latestOwner],
      });

      return (roles & registryRoles.wasReserved) !== 0n;
    }),
  );
});

export const isMigrated = defineReadAction<GetNameStateParameters, boolean, GetNameStateError>(
  isMigratedEffect,
);

export type {
  GetNameStateError as IsMigratedError,
  GetNameStateParameters as IsMigratedParameters,
} from "../get-name-state/types.js";
