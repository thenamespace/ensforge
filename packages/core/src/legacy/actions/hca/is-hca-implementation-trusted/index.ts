import { Effect } from "effect";

import { trustedHcaSetV2ManagementAbi } from "@ensforge/contracts/internal";
import type { Address } from "viem";

import type { BlockParameters } from "../../../action/block.js";
import { defineReadAction } from "../../../action/read-request.js";
import { hcaRpc, validateHcaAddress } from "../../../internal/hca/context.js";
import { withHcaSnapshot } from "../../../internal/hca/read.js";
import { type HcaErrorResult } from "../types.js";

export const isHcaImplementationTrusted = defineReadAction<
  BlockParameters & { readonly implementation: Address },
  boolean,
  HcaErrorResult
>((config, parameters) =>
  withHcaSnapshot(config, parameters, (profile, blockNumber) =>
    Effect.gen(function* () {
      const implementation = yield* validateHcaAddress(parameters.implementation);

      const address = yield* validateHcaAddress(profile.deployment.hca?.upgradeSet);

      return yield* hcaRpc(() =>
        config.publicClient.readContract({
          address,
          abi: trustedHcaSetV2ManagementAbi,
          functionName: "includes",
          args: [implementation],
          blockNumber,
        }),
      );
    }),
  ),
);
