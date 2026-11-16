import { Effect, Schema } from "effect";

import { trustedHcaSetV2ManagementAbi } from "@ensforge/contracts/internal";
import { encodeFunctionData, type Address } from "viem";

import { defineAction } from "../../../../action/action.js";
import { HcaError } from "../../../../errors/hca-error.js";
import { resolveHcaProfile, validateHcaAddress } from "../../../../internal/hca/context.js";
import { submitHcaManagement } from "../../../../internal/hca/management.js";
import type { WriteError } from "../../../../write/types.js";
import { validateRoleBitmap } from "../../../permissions/roles.js";
import type { HcaManagementResult } from "../../management-types.js";
import { HcaSalt } from "../../types.js";
import type { HcaAdminWriteParameters } from "../types.js";

export const revokeTrustedHcaRoles = defineAction<
  HcaAdminWriteParameters & {
    readonly assignee: Address;
    readonly roles: bigint;
    readonly resource?: bigint;
  },
  HcaManagementResult,
  WriteError
>(
  Effect.fn("ensforge.revokeTrustedHcaRoles")(function* (config, parameters) {
    const profile = yield* resolveHcaProfile(config);
    const address = yield* validateHcaAddress(profile.deployment.hca?.upgradeSet);

    const assignee = yield* validateHcaAddress(parameters.assignee);
    const roles = yield* validateRoleBitmap(parameters.roles);
    const resource = parameters.resource ?? 0n;

    if (!Schema.is(HcaSalt)(resource))
      return yield* new HcaError({
        code: "INVALID_PARAMETERS",
        message: "Role resource must be uint256",
      });

    return yield* submitHcaManagement(config, parameters, {
      operation: "revokeTrustedHcaRoles",
      to: address,
      value: 0n,
      // EAC requires dedicated methods for the root resource.
      data:
        resource === 0n
          ? encodeFunctionData({
              abi: trustedHcaSetV2ManagementAbi,
              functionName: "revokeRootRoles",
              args: [roles, assignee],
            })
          : encodeFunctionData({
              abi: trustedHcaSetV2ManagementAbi,
              functionName: "revokeRoles",
              args: [resource, roles, assignee],
            }),
    });
  }),
);
