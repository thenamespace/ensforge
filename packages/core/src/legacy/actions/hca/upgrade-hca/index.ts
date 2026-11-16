import { Effect, Schema } from "effect";

import { standaloneHcaV2ManagementAbi } from "@ensforge/contracts/internal";
import { encodeFunctionData, isAddressEqual, type Address, type Hex } from "viem";

import { defineAction } from "../../../action/action.js";
import { HcaError } from "../../../errors/hca-error.js";
import { submitHcaManagement } from "../../../internal/hca/management.js";
import { Hex as HexSchema } from "../../../schemas/hex.js";
import type { WriteError } from "../../../write/types.js";
import { getHcaImplementation } from "../get-hca-implementation/index.js";
import { getHcaUpgradeEligibility } from "../get-hca-upgrade-eligibility/index.js";
import type { HcaManagementParameters, HcaManagementResult } from "../management-types.js";
import { verifyHca } from "../verify-hca/index.js";

export const upgradeHca = defineAction<
  HcaManagementParameters & { readonly implementation: Address; readonly data?: Hex },
  HcaManagementResult,
  WriteError
>(
  Effect.fn("ensforge.upgradeHca")(function* (config, parameters) {
    const data = parameters.data ?? "0x";

    if (!Schema.is(HexSchema)(data))
      return yield* new HcaError({
        code: "INVALID_PARAMETERS",
        message: "Upgrade initialization data must be hex bytes",
      });

    const eligibility = yield* getHcaUpgradeEligibility.effect(config, parameters);

    if (!eligibility.eligible)
      return yield* new HcaError({
        code: "UNSUPPORTED_CAPABILITY",
        message: "Upgrade requires compatible proxy storage and approval in both directional gates",
      });

    const account = yield* verifyHca.effect(config, parameters);
    const result = yield* submitHcaManagement(config, parameters, {
      operation: "upgradeHca",
      to: account.address,
      owner: account.owner,
      value: 0n,
      data: encodeFunctionData({
        abi: standaloneHcaV2ManagementAbi,
        functionName: "upgradeToAndCall",
        args: [eligibility.implementation, data],
      }),
    });

    if (result.receipt) {
      const implementation = yield* getHcaImplementation.effect(config, {
        hca: account.address,
        blockNumber: result.receipt.blockNumber,
      });

      if (!implementation || !isAddressEqual(implementation, eligibility.implementation))
        return yield* new HcaError({
          code: "ACCOUNT_MISMATCH",
          message: "Confirmed upgrade did not install the requested implementation",
        });
    }

    // A successful upgrade does not certify the new generation for existing execution adapters.
    return result;
  }),
);
