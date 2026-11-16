import { Effect } from "effect";

import { hcaUpgradeGateV2ManagementAbi } from "@ensforge/contracts/internal";
import { encodeFunctionData } from "viem";

import { defineAction } from "../../../../action/action.js";
import { resolveHcaProfile } from "../../../../internal/hca/context.js";
import { readHcaGovernanceTarget } from "../../../../internal/hca/governance.js";
import { submitHcaManagement } from "../../../../internal/hca/management.js";
import type { WriteError } from "../../../../write/types.js";
import type { HcaManagementResult } from "../../management-types.js";
import type { HcaAdminWriteParameters, HcaGovernanceTarget } from "../types.js";

export const renounceHcaGovernanceOwnership = defineAction<
  HcaAdminWriteParameters & { readonly target: HcaGovernanceTarget },
  HcaManagementResult,
  WriteError
>(
  Effect.fn("ensforge.renounceHcaGovernanceOwnership")(function* (config, parameters) {
    const profile = yield* resolveHcaProfile(config);
    const { address, owner } = yield* readHcaGovernanceTarget(config, profile, parameters.target);

    return yield* submitHcaManagement(config, parameters, {
      operation: "renounceHcaGovernanceOwnership",
      to: address,
      value: 0n,
      owner,
      data: encodeFunctionData({
        abi: hcaUpgradeGateV2ManagementAbi,
        functionName: "renounceOwnership",
      }),
    });
  }),
);
