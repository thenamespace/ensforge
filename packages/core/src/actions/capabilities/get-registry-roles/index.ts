import { Effect } from "effect";

import { permissionedRegistryV2InterfaceRolesAbi } from "@ensforge/contracts/internal";

import { defineReadAction } from "../../../action/read-request.js";
import type { EnsforgeConfig } from "../../../config/config.js";
import { readRegistryPermissionTarget } from "../../../internal/capabilities/registry-permissions.js";
import { EthereumClient } from "../../../internal/client/ethereum-client.js";
import { executeRead } from "../../../internal/read/execute-read.js";
import { normalizeName } from "../../../names/normalize.js";
import type {
  AccountCapabilityParameters,
  CapabilityError,
  RegistryRolesResult,
} from "../types.js";

const getRegistryRolesEffect = Effect.fn("ensforge.getRegistryRoles")(function* (
  config: EnsforgeConfig,
  parameters: AccountCapabilityParameters,
) {
  const name = yield* normalizeName.effect(parameters.name);

  return yield* executeRead(
    config,
    parameters,
    Effect.gen(function* () {
      const target = yield* readRegistryPermissionTarget(name);

      if (!target.supported) return target;

      const ethereum = yield* EthereumClient;

      const roles = yield* ethereum.readContract({
        address: target.registry,
        abi: permissionedRegistryV2InterfaceRolesAbi,
        functionName: "roles",
        args: [target.anyId, parameters.account],
      });

      return { ...target, account: parameters.account, roles } as const;
    }),
  );
});

export const getRegistryRoles = defineReadAction<
  AccountCapabilityParameters,
  RegistryRolesResult,
  CapabilityError
>(getRegistryRolesEffect);

export type {
  AccountCapabilityParameters as GetRegistryRolesParameters,
  CapabilityError as GetRegistryRolesError,
  RegistryRolesResult,
} from "../types.js";
