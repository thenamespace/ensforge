import { Effect, Schema } from "effect";

import { standaloneHcaV2AccountReadsAbi } from "@ensforge/contracts/internal";
import { type Address, type Hex } from "viem";

import { defineReadAction } from "../../../action/read-request.js";
import { HcaError } from "../../../errors/hca-error.js";
import { hcaRpc, validateHcaAddress } from "../../../internal/hca/context.js";
import { withHcaSnapshot } from "../../../internal/hca/read.js";
import { Hex as HexSchema } from "../../../schemas/hex.js";
import { type HcaErrorResult, type HcaReadParameters } from "../types.js";

export const getHcaFallbackHandler = defineReadAction<
  HcaReadParameters & { readonly selector: Hex },
  { readonly callType: Hex; readonly handler: Address },
  HcaErrorResult
>((config, parameters) =>
  withHcaSnapshot(config, parameters, (_profile, blockNumber) =>
    Effect.gen(function* () {
      const address = yield* validateHcaAddress(parameters.hca);

      if (!Schema.is(HexSchema.check(Schema.isPattern(/^0x[0-9a-fA-F]{8}$/)))(parameters.selector))
        return yield* new HcaError({
          code: "INVALID_PARAMETERS",
          message: "Fallback selector must be bytes4",
        });

      const result = yield* hcaRpc(() =>
        config.publicClient.readContract({
          address,
          abi: standaloneHcaV2AccountReadsAbi,
          functionName: "getFallbackHandlerBySelector",
          args: [parameters.selector],
          blockNumber,
        }),
      );

      return { callType: result[0], handler: result[1] };
    }),
  ),
);
