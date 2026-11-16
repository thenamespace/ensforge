import { Effect, Schema } from "effect";

import {
  standaloneHcaV2ManagementAbi,
  standaloneHcaV2ExecuteByOwnerAbi,
} from "@ensforge/contracts/internal";
import { encodeFunctionData, type Address } from "viem";

import { defineAction } from "../../../action/action.js";
import { HcaError } from "../../../errors/hca-error.js";
import { hcaRpc, resolveHcaProfile, validateHcaAddress } from "../../../internal/hca/context.js";
import { submitHcaManagement } from "../../../internal/hca/management.js";
import type { WriteError } from "../../../write/types.js";
import type { HcaManagementParameters, HcaManagementResult } from "../management-types.js";
import { HcaSalt } from "../types.js";
import { verifyHca } from "../verify-hca/index.js";

export const withdrawHcaDeposit = defineAction<
  HcaManagementParameters & { readonly amount: bigint; readonly to: Address },
  HcaManagementResult,
  WriteError
>(
  Effect.fn("ensforge.withdrawHcaDeposit")(function* (config, parameters) {
    if (!Schema.is(HcaSalt)(parameters.amount) || parameters.amount === 0n)
      return yield* new HcaError({
        code: "INVALID_PARAMETERS",
        message: "Deposit amount must be a positive uint256",
      });

    const account = yield* verifyHca.effect(config, parameters);
    const to = yield* validateHcaAddress(parameters.to);
    const profile = yield* resolveHcaProfile(config);
    const entryPoint = profile.infrastructure.entryPoint;
    const code = yield* hcaRpc(() => config.publicClient.getCode({ address: entryPoint }));

    if (!code || code === "0x")
      return yield* new HcaError({
        code: "UNSUPPORTED_DEPLOYMENT",
        message: "The configured EntryPoint is not deployed",
      });

    // withdrawDepositTo is EntryPoint-or-self gated. The immutable owner authorizes this exact self-call.
    const withdrawal = encodeFunctionData({
      abi: standaloneHcaV2ManagementAbi,
      functionName: "withdrawDepositTo",
      args: [to, parameters.amount],
    });
    const data = encodeFunctionData({
      abi: standaloneHcaV2ExecuteByOwnerAbi,
      functionName: "executeByOwner",
      args: [[{ target: account.address, value: 0n, callData: withdrawal }]],
    });

    return yield* submitHcaManagement(config, parameters, {
      operation: "withdrawHcaDeposit",
      to: account.address,
      data,
      value: 0n,
      owner: account.owner,
    });
  }),
);
