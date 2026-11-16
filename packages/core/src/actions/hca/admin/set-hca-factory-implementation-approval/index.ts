import { Effect } from "effect";

import { hcaUpgradeGateV2ManagementAbi } from "@ensforge/contracts/internal";
import { encodeFunctionData, type Address } from "viem";

import { defineAction } from "../../../../action/action.js";
import { HcaError } from "../../../../errors/hca-error.js";
import { resolveHcaProfile, validateHcaAddress } from "../../../../internal/hca/context.js";
import { readHcaGovernanceTarget } from "../../../../internal/hca/governance.js";
import { submitHcaManagement } from "../../../../internal/hca/management.js";
import type { WriteError } from "../../../../write/types.js";
import type { HcaManagementResult } from "../../management-types.js";
import type { HcaAdminWriteParameters } from "../types.js";

export const setHcaFactoryImplementationApproval = defineAction<
  HcaAdminWriteParameters & { readonly implementation: Address; readonly approved: boolean },
  HcaManagementResult,
  WriteError
>(
  Effect.fn("ensforge.setHcaFactoryImplementationApproval")(function* (config, parameters) {
    const profile = yield* resolveHcaProfile(config);
    const { address, owner } = yield* readHcaGovernanceTarget(config, profile, { kind: "factory" });

    const implementation = yield* validateHcaAddress(parameters.implementation);

    if (typeof parameters.approved !== "boolean")
      return yield* new HcaError({
        code: "INVALID_PARAMETERS",
        message: "Implementation approval must be boolean",
      });

    return yield* submitHcaManagement(config, parameters, {
      operation: "setHcaFactoryImplementationApproval",
      to: address,
      value: 0n,
      owner,
      data: encodeFunctionData({
        abi: hcaUpgradeGateV2ManagementAbi,
        functionName: "setImplementationApproval",
        args: [implementation, parameters.approved],
      }),
    });
  }),
);
