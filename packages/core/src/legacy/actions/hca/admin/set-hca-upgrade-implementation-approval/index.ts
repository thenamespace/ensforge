import { Effect } from "effect";

import { permissionedAddressSetV2Abi } from "@ensforge/contracts/v2";
import { encodeFunctionData, type Address } from "viem";

import { defineAction } from "../../../../action/action.js";
import { HcaError } from "../../../../errors/hca-error.js";
import { resolveHcaProfile, validateHcaAddress } from "../../../../internal/hca/context.js";
import { submitHcaManagement } from "../../../../internal/hca/management.js";
import type { WriteError } from "../../../../write/types.js";
import type { HcaManagementResult } from "../../management-types.js";
import type { HcaAdminWriteParameters } from "../types.js";

export const setHcaUpgradeImplementationApproval = defineAction<
  HcaAdminWriteParameters & {
    readonly implementation: Address;
    readonly approved: boolean;
    readonly gate?: Address;
  },
  HcaManagementResult,
  WriteError
>(
  Effect.fn("ensforge.setHcaUpgradeImplementationApproval")(function* (config, parameters) {
    const profile = yield* resolveHcaProfile(config);
    const address = yield* validateHcaAddress(parameters.gate ?? profile.contracts.upgradeSet);

    const implementation = yield* validateHcaAddress(parameters.implementation);

    if (typeof parameters.approved !== "boolean")
      return yield* new HcaError({
        code: "INVALID_PARAMETERS",
        message: "Implementation approval must be boolean",
      });

    return yield* submitHcaManagement(config, parameters, {
      operation: "setHcaUpgradeImplementationApproval",
      to: address,
      value: 0n,
      data: encodeFunctionData({
        abi: permissionedAddressSetV2Abi,
        functionName: "approve",
        args: [implementation, parameters.approved],
      }),
    });
  }),
);
