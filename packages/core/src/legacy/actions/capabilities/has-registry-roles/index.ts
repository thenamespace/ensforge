import { Effect } from "effect";

import { permissionedRegistryV2InterfaceHasRolesAbi } from "@ensforge/contracts/internal";

import { defineReadAction } from "../../../action/read-request.js";
import type { EnsforgeConfig } from "../../../config/config.js";
import { readRegistryPermissionTarget } from "../../../internal/capabilities/registry-permissions.js";
import { EthereumClient } from "../../../internal/client/ethereum-client.js";
import { executeRead } from "../../../internal/read/execute-read.js";
import { normalizeName } from "../../../names/normalize.js";
import type {
  AccountCapabilityParameters,
  CapabilityError,
  HasRegistryRolesResult,
} from "../types.js";

export type HasRegistryRolesParameters = AccountCapabilityParameters & {
  readonly roles: bigint;
};

const hasRegistryRolesEffect = Effect.fn("ensforge.hasRegistryRoles")(function* (
  config: EnsforgeConfig,
  parameters: HasRegistryRolesParameters,
) {
  const name = yield* normalizeName.effect(parameters.name);

  return yield* executeRead(
    config,
    parameters,
    Effect.gen(function* () {
      const target = yield* readRegistryPermissionTarget(name);

      if (!target.supported) return target;

      const ethereum = yield* EthereumClient;

      const authorized = yield* ethereum.readContract({
        address: target.registry,
        abi: permissionedRegistryV2InterfaceHasRolesAbi,
        functionName: "hasRoles",
        args: [target.anyId, parameters.roles, parameters.account],
      });

      return {
        ...target,
        account: parameters.account,
        roles: parameters.roles,
        authorized,
      } as const;
    }),
  );
});

export const hasRegistryRoles = defineReadAction<
  HasRegistryRolesParameters,
  HasRegistryRolesResult,
  CapabilityError
>(hasRegistryRolesEffect);

export type { CapabilityError as HasRegistryRolesError, HasRegistryRolesResult } from "../types.js";
