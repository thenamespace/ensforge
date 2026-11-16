import { Effect, Schema } from "effect";

import { standaloneHcaV2AccountReadsAbi } from "@ensforge/contracts/internal";

import { defineReadAction } from "../../../action/read-request.js";
import { HcaError } from "../../../errors/hca-error.js";
import { hcaRpc, validateHcaAddress } from "../../../internal/hca/context.js";
import { withHcaSnapshot } from "../../../internal/hca/read.js";
import { HcaSalt, type HcaErrorResult, type HcaReadParameters } from "../types.js";

export const getHcaNonce = defineReadAction<
  HcaReadParameters & { readonly key: bigint },
  bigint,
  HcaErrorResult
>((config, parameters) =>
  withHcaSnapshot(config, parameters, (_profile, blockNumber) =>
    Effect.gen(function* () {
      const address = yield* validateHcaAddress(parameters.hca);

      if (!Schema.is(HcaSalt)(parameters.key) || parameters.key >= 1n << 192n)
        return yield* new HcaError({
          code: "INVALID_PARAMETERS",
          message: "Nonce key must be a uint192",
        });

      return yield* hcaRpc(() =>
        config.publicClient.readContract({
          address,
          abi: standaloneHcaV2AccountReadsAbi,
          functionName: "nonce",
          args: [parameters.key],
          blockNumber,
        }),
      );
    }),
  ),
);
