import { Effect, Schema } from "effect";

import { standaloneHcaV2AccountReadsAbi } from "@ensforge/contracts/internal";
import { type Address, type Hex } from "viem";

import { defineReadAction } from "../../../action/read-request.js";
import { HcaError } from "../../../errors/hca-error.js";
import { hcaRpc, validateHcaAddress } from "../../../internal/hca/context.js";
import { withHcaSnapshot } from "../../../internal/hca/read.js";
import { Hex as HexSchema } from "../../../schemas/hex.js";
import { HcaSalt, type HcaErrorResult, type HcaReadParameters } from "../types.js";

export const isHcaModuleInstalled = defineReadAction<
  HcaReadParameters & {
    readonly moduleTypeId: bigint;
    readonly module: Address;
    readonly additionalContext?: Hex;
  },
  boolean,
  HcaErrorResult
>((config, parameters) =>
  withHcaSnapshot(config, parameters, (_profile, blockNumber) =>
    Effect.gen(function* () {
      const address = yield* validateHcaAddress(parameters.hca);
      yield* validateHcaAddress(parameters.module);

      if (
        !Schema.is(HcaSalt)(parameters.moduleTypeId) ||
        !Schema.is(HexSchema)(parameters.additionalContext ?? "0x")
      )
        return yield* new HcaError({
          code: "INVALID_PARAMETERS",
          message: "Expected a uint256 module type and hex context",
        });

      return yield* hcaRpc(() =>
        config.publicClient.readContract({
          address,
          abi: standaloneHcaV2AccountReadsAbi,
          functionName: "isModuleInstalled",
          args: [parameters.moduleTypeId, parameters.module, parameters.additionalContext ?? "0x"],
          blockNumber,
        }),
      );
    }),
  ),
);
