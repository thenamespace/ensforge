import { Effect } from "effect";

import { hcaUpgradeGateV2ManagementAbi } from "@ensforge/contracts/internal";
import { encodeFunctionData, type Address } from "viem";

import { defineAction } from "../../../../action/action.js";
import { resolveHcaProfile, validateHcaAddress } from "../../../../internal/hca/context.js";
import { readHcaGovernanceTarget } from "../../../../internal/hca/governance.js";
import { submitHcaManagement } from "../../../../internal/hca/management.js";
import type { WriteError } from "../../../../write/types.js";
import type { HcaManagementResult } from "../../management-types.js";
import type { HcaAdminWriteParameters, HcaGovernanceTarget } from "../types.js";

export const transferHcaGovernanceOwnership = defineAction<
  HcaAdminWriteParameters & { readonly target: HcaGovernanceTarget; readonly newOwner: Address },
  HcaManagementResult,
  WriteError
>(
  Effect.fn("ensforge.transferHcaGovernanceOwnership")(function* (config, parameters) {
    const profile = yield* resolveHcaProfile(config);
    const { address, owner } = yield* readHcaGovernanceTarget(config, profile, parameters.target);

    const newOwner = yield* validateHcaAddress(parameters.newOwner);

    return yield* submitHcaManagement(config, parameters, {
      operation: "transferHcaGovernanceOwnership",
      to: address,
      value: 0n,
      owner,
      data: encodeFunctionData({
        abi: hcaUpgradeGateV2ManagementAbi,
        functionName: "transferOwnership",
        args: [newOwner],
      }),
    });
  }),
);
