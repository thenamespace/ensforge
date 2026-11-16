import { Effect } from "effect";

import {
  type HcaDeploymentProfile,
  hcaUpgradeGateV2ManagementAbi,
} from "@ensforge/contracts/internal";

import type { HcaGovernanceTarget } from "../../actions/hca/admin/types.js";
import type { EnsforgeConfig } from "../../config/config.js";
import { HcaError } from "../../errors/hca-error.js";
import { hcaRpc, validateHcaAddress } from "./context.js";

export const readHcaGovernanceTarget = Effect.fn("readHcaGovernanceTarget")(function* (
  config: EnsforgeConfig,
  profile: HcaDeploymentProfile,
  target: HcaGovernanceTarget,
  blockNumber?: bigint,
) {
  if (target.kind !== "factory")
    return yield* new HcaError({
      code: "INVALID_PARAMETERS",
      message: "Only the factory has an owner; the HCA upgrade set uses role-based governance",
    });

  const address = yield* validateHcaAddress(profile.contracts.standaloneFactory);
  const owner = yield* hcaRpc(() =>
    config.publicClient.readContract({
      address,
      abi: hcaUpgradeGateV2ManagementAbi,
      functionName: "owner",
      ...(blockNumber === undefined ? {} : { blockNumber }),
    }),
  );

  return { address, owner };
});
