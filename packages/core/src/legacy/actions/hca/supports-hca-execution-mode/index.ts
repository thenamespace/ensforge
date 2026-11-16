import { Effect, Schema } from "effect";

import { standaloneHcaV2AccountReadsAbi } from "@ensforge/contracts/internal";
import { type Hex } from "viem";

import { defineReadAction } from "../../../action/read-request.js";
import { HcaError } from "../../../errors/hca-error.js";
import { hcaRpc, validateHcaAddress } from "../../../internal/hca/context.js";
import { withHcaSnapshot } from "../../../internal/hca/read.js";
import { HcaExecutionHash } from "../execution-contract.js";
import { type HcaErrorResult, type HcaReadParameters } from "../types.js";

export const supportsHcaExecutionMode = defineReadAction<
  HcaReadParameters & { readonly mode: Hex },
  boolean,
  HcaErrorResult
>((config, parameters) =>
  withHcaSnapshot(config, parameters, (_profile, blockNumber) =>
    Effect.gen(function* () {
      const address = yield* validateHcaAddress(parameters.hca);

      if (!Schema.is(HcaExecutionHash)(parameters.mode))
        return yield* new HcaError({
          code: "INVALID_PARAMETERS",
          message: "Execution mode must be bytes32",
        });

      return yield* hcaRpc(() =>
        config.publicClient.readContract({
          address,
          abi: standaloneHcaV2AccountReadsAbi,
          functionName: "supportsExecutionMode",
          args: [parameters.mode],
          blockNumber,
        }),
      );
    }),
  ),
);
