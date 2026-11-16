import { Effect } from "effect";

import { standaloneHcaV2AccountReadsAbi } from "@ensforge/contracts/internal";

import { defineReadAction } from "../../../action/read-request.js";
import { hcaRpc, validateHcaAddress } from "../../../internal/hca/context.js";
import { withHcaSnapshot } from "../../../internal/hca/read.js";
import type { HcaSigningDomain } from "../management-types.js";
import { type HcaErrorResult, type HcaReadParameters } from "../types.js";

export const getHcaSigningDomain = defineReadAction<
  HcaReadParameters,
  HcaSigningDomain,
  HcaErrorResult
>((config, parameters) =>
  withHcaSnapshot(config, parameters, (_profile, blockNumber) =>
    Effect.gen(function* () {
      const address = yield* validateHcaAddress(parameters.hca);

      const result = yield* hcaRpc(() =>
        config.publicClient.readContract({
          address,
          abi: standaloneHcaV2AccountReadsAbi,
          functionName: "eip712Domain",
          blockNumber,
        }),
      );

      return {
        fields: result[0],
        name: result[1],
        version: result[2],
        chainId: result[3],
        verifyingContract: result[4],
        salt: result[5],
        extensions: result[6],
      };
    }),
  ),
);
