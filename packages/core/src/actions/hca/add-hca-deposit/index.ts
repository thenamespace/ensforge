import { Effect, Schema } from "effect";

import { standaloneHcaV2ManagementAbi } from "@ensforge/contracts/internal";
import { encodeFunctionData } from "viem";

import { defineAction } from "../../../action/action.js";
import { HcaError } from "../../../errors/hca-error.js";
import { hcaRpc, resolveHcaProfile } from "../../../internal/hca/context.js";
import { submitHcaManagement } from "../../../internal/hca/management.js";
import type { WriteError } from "../../../write/types.js";
import type { HcaManagementParameters, HcaManagementResult } from "../management-types.js";
import { HcaSalt } from "../types.js";
import { verifyHca } from "../verify-hca/index.js";

export const addHcaDeposit = defineAction<
  HcaManagementParameters & { readonly amount: bigint },
  HcaManagementResult,
  WriteError
>(
  Effect.fn("ensforge.addHcaDeposit")(function* (config, parameters) {
    if (!Schema.is(HcaSalt)(parameters.amount) || parameters.amount === 0n)
      return yield* new HcaError({
        code: "INVALID_PARAMETERS",
        message: "Deposit amount must be a positive uint256",
      });

    const account = yield* verifyHca.effect(config, parameters);

    const profile = yield* resolveHcaProfile(config);
    const entryPoint = profile.infrastructure.entryPoint;
    const code = yield* hcaRpc(() => config.publicClient.getCode({ address: entryPoint }));

    if (!code || code === "0x")
      return yield* new HcaError({
        code: "UNSUPPORTED_DEPLOYMENT",
        message: "The configured EntryPoint is not deployed",
      });

    const data = encodeFunctionData({
      abi: standaloneHcaV2ManagementAbi,
      functionName: "addDeposit",
    });

    return yield* submitHcaManagement(config, parameters, {
      operation: "addHcaDeposit",
      to: account.address,
      data,
      value: parameters.amount,
    });
  }),
);
