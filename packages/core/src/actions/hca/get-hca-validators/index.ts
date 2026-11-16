import { Effect, Schema } from "effect";

import { standaloneHcaV2AccountReadsAbi } from "@ensforge/contracts/internal";
import { zeroAddress } from "viem";

import { defineReadAction } from "../../../action/read-request.js";
import { HcaError } from "../../../errors/hca-error.js";
import { hcaRpc, validateHcaAddress } from "../../../internal/hca/context.js";
import { withHcaSnapshot } from "../../../internal/hca/read.js";
import { EthereumAddress } from "../../../schemas/identity.js";
import type { HcaModulePage, HcaModulePageParameters } from "../management-types.js";
import { HcaSalt, type HcaErrorResult, type HcaReadParameters } from "../types.js";

export const getHcaValidators = defineReadAction<
  HcaReadParameters & HcaModulePageParameters,
  HcaModulePage,
  HcaErrorResult
>((config, parameters) =>
  withHcaSnapshot(config, parameters, (_profile, blockNumber) =>
    Effect.gen(function* () {
      const address = yield* validateHcaAddress(parameters.hca);
      const cursor = parameters.cursor ?? "0x0000000000000000000000000000000000000001";
      const size = parameters.size ?? 50n;

      if (
        !Schema.is(EthereumAddress)(cursor) ||
        cursor === zeroAddress ||
        !Schema.is(HcaSalt)(size) ||
        size === 0n ||
        size > 1000n
      )
        return yield* new HcaError({
          code: "INVALID_PARAMETERS",
          message:
            "Use the sentinel or a returned module cursor, and a page size between 1 and 1000",
        });

      const result = yield* hcaRpc(() =>
        config.publicClient.readContract({
          address,
          abi: standaloneHcaV2AccountReadsAbi,
          functionName: "getValidatorsPaginated",
          args: [cursor, size],
          blockNumber,
        }),
      );

      return { modules: result[0], nextCursor: result[1] };
    }),
  ),
);
