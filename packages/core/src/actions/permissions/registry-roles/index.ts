import { Effect } from "effect";

import { permissionedRegistryV2RoleMutationAbi } from "@ensforge/contracts/internal";
import { encodeFunctionData } from "viem";

import type { EnsWriteIntentPreparer } from "../../../action/write-intent.js";
import type { EnsforgeConfig } from "../../../config/config.js";
import { AuthorizationError } from "../../../errors/authorization-error.js";
import { ContractError } from "../../../errors/contract-error.js";
import { readRegistryPermissionTarget } from "../../../internal/capabilities/registry-permissions.js";
import { executeRead } from "../../../internal/read/execute-read.js";
import { makeSingleWriteAction } from "../../../internal/write/single-write-action.js";
import { normalizeName } from "../../../names/normalize.js";
import type { WriteError } from "../../../write/types.js";
import { decodePermissionAddress } from "../address.js";
import { validateRoleBitmap } from "../roles.js";
import type { RegistryRolesMutationParameters } from "./types.js";

const makePreparer = (
  mutation: "grantRoles" | "revokeRoles",
): EnsWriteIntentPreparer<RegistryRolesMutationParameters, WriteError> =>
  Effect.fn(`ensforge.${mutation === "grantRoles" ? "grant" : "revoke"}RegistryRoles.prepare`)(
    function* (config: EnsforgeConfig, parameters) {
      const name = yield* normalizeName.effect(parameters.name);
      const account = yield* decodePermissionAddress(parameters.account, "role account");
      const roles = yield* validateRoleBitmap(parameters.roles);
      const target = yield* executeRead(config, {}, readRegistryPermissionTarget(name));

      if (!target.supported) {
        return yield* new AuthorizationError({
          code: "WRITE_TARGET_UNAVAILABLE",
          message: `Registry roles are unavailable for ${name}`,
        });
      }

      const data = yield* Effect.try({
        try: () =>
          encodeFunctionData({
            abi: permissionedRegistryV2RoleMutationAbi,
            functionName: mutation,
            args: [target.anyId, roles, account],
          }),
        catch: (cause) =>
          new ContractError({
            code: "ENCODE_FAILED",
            message: `Unable to encode ${mutation} for ${name}`,
            cause,
          }),
      });

      return { to: target.registry, data, value: 0n, protocol: "v2" as const };
    },
  );

export const grantRegistryRoles = makeSingleWriteAction(
  "grantRegistryRoles",
  makePreparer("grantRoles"),
);

export const revokeRegistryRoles = makeSingleWriteAction(
  "revokeRegistryRoles",
  makePreparer("revokeRoles"),
);

export type {
  GrantRegistryRolesError,
  GrantRegistryRolesIntent,
  GrantRegistryRolesParameters,
  GrantRegistryRolesResult,
  RegistryRolesMutationParameters,
  RevokeRegistryRolesError,
  RevokeRegistryRolesIntent,
  RevokeRegistryRolesParameters,
  RevokeRegistryRolesResult,
} from "./types.js";
