import { Effect } from "effect";

import { standaloneHcaFactoryV2DeploymentAbi } from "@ensforge/contracts/internal";
import { type Address } from "viem";

import type { BlockParameters } from "../../../action/block.js";
import { defineReadAction } from "../../../action/read-request.js";
import { hcaRpc, validateHcaAddress } from "../../../internal/hca/context.js";
import { withHcaSnapshot } from "../../../internal/hca/read.js";
import type { HcaErrorResult } from "../types.js";

export const getHcaImplementationApproval = defineReadAction<
  BlockParameters & { readonly implementation: Address },
  boolean,
  HcaErrorResult
>((config, parameters) =>
  withHcaSnapshot(config, parameters, (profile, blockNumber) =>
    Effect.gen(function* () {
      const implementation = yield* validateHcaAddress(parameters.implementation);

      return yield* hcaRpc(() =>
        config.publicClient.readContract({
          address: profile.contracts.standaloneFactory,
          abi: standaloneHcaFactoryV2DeploymentAbi,
          functionName: "approvedImplementations",
          args: [implementation],
          blockNumber,
        }),
      );
    }),
  ),
);
