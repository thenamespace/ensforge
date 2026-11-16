import { Effect } from "effect";

import { trustedHcaSetV2ManagementAbi } from "@ensforge/contracts/internal";
import { encodeFunctionData, type Address } from "viem";

import { defineAction } from "../../../../action/action.js";
import { HcaError } from "../../../../errors/hca-error.js";
import { resolveHcaProfile, validateHcaAddress } from "../../../../internal/hca/context.js";
import { submitHcaManagement } from "../../../../internal/hca/management.js";
import type { WriteError } from "../../../../write/types.js";
import type { HcaManagementResult } from "../../management-types.js";
import type { HcaAdminWriteParameters } from "../types.js";

export const setTrustedHcaImplementation = defineAction<
  HcaAdminWriteParameters & { readonly implementation: Address; readonly approved: boolean },
  HcaManagementResult,
  WriteError
>(
  Effect.fn("ensforge.setTrustedHcaImplementation")(function* (config, parameters) {
    const profile = yield* resolveHcaProfile(config);
    const address = yield* validateHcaAddress(profile.deployment.hca?.upgradeSet);

    const implementation = yield* validateHcaAddress(parameters.implementation);

    if (typeof parameters.approved !== "boolean")
      return yield* new HcaError({
        code: "INVALID_PARAMETERS",
        message: "Implementation approval must be boolean",
      });

    return yield* submitHcaManagement(config, parameters, {
      operation: "setTrustedHcaImplementation",
      to: address,
      value: 0n,
      data: encodeFunctionData({
        abi: trustedHcaSetV2ManagementAbi,
        functionName: "approve",
        args: [implementation, parameters.approved],
      }),
    });
  }),
);
