import { Effect, Schema } from "effect";

import { hcaValidatorV2SessionsAbi } from "@ensforge/contracts/internal";
import { type Hex } from "viem";

import { defineReadAction } from "../../../action/read-request.js";
import { HcaError } from "../../../errors/hca-error.js";
import { hcaRpc, resolveHcaProfile, validateHcaAddress } from "../../../internal/hca/context.js";
import type { WriteError } from "../../../write/types.js";
import { HcaExecutionHash } from "../execution-contract.js";
import type { HcaReadParameters } from "../types.js";

export const isHcaSessionEnabled = defineReadAction<
  HcaReadParameters & { readonly permissionId: Hex },
  boolean,
  WriteError
>(
  Effect.fn("ensforge.isHcaSessionEnabled")(function* (config, parameters) {
    const profile = yield* resolveHcaProfile(config);
    yield* validateHcaAddress(parameters.hca);

    if (!Schema.is(HcaExecutionHash)(parameters.permissionId))
      return yield* new HcaError({
        code: "INVALID_PARAMETERS",
        message: "Permission ID must be bytes32",
      });

    return yield* hcaRpc(() =>
      config.publicClient.readContract({
        address: profile.contracts.ownerAndSessionValidator,
        abi: hcaValidatorV2SessionsAbi,
        functionName: "isPermissionEnabled",
        args: [parameters.hca, parameters.permissionId],
        ...(parameters.blockNumber === undefined ? {} : { blockNumber: parameters.blockNumber }),
        ...(parameters.blockTag === undefined ? {} : { blockTag: parameters.blockTag }),
      }),
    );
  }),
);
