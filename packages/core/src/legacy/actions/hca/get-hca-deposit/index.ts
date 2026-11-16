import { Effect } from "effect";

import { standaloneHcaV2AccountReadsAbi } from "@ensforge/contracts/internal";

import { defineReadAction } from "../../../action/read-request.js";
import { hcaRpc, validateHcaAddress } from "../../../internal/hca/context.js";
import { withHcaSnapshot } from "../../../internal/hca/read.js";
import { type HcaErrorResult, type HcaReadParameters } from "../types.js";

export const getHcaDeposit = defineReadAction<HcaReadParameters, bigint, HcaErrorResult>(
  (config, parameters) =>
    withHcaSnapshot(config, parameters, (_profile, blockNumber) =>
      Effect.gen(function* () {
        const address = yield* validateHcaAddress(parameters.hca);

        return yield* hcaRpc(() =>
          config.publicClient.readContract({
            address,
            abi: standaloneHcaV2AccountReadsAbi,
            functionName: "getDeposit",
            blockNumber,
          }),
        );
      }),
    ),
);
