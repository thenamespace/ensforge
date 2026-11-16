import { Effect } from "effect";

import { standaloneHcaFactoryV2DeploymentAbi } from "@ensforge/contracts/internal";
import { zeroAddress, type Address } from "viem";

import { defineReadAction } from "../../../action/read-request.js";
import { hcaRpc, validateHcaAddress } from "../../../internal/hca/context.js";
import { withHcaSnapshot } from "../../../internal/hca/read.js";
import type { HcaErrorResult, HcaReadParameters } from "../types.js";

export const getAuthorizedHcaOwner = defineReadAction<
  HcaReadParameters,
  Address | null,
  HcaErrorResult
>((config, parameters) =>
  withHcaSnapshot(config, parameters, (profile, blockNumber) =>
    Effect.gen(function* () {
      const hca = yield* validateHcaAddress(parameters.hca);

      const owner = yield* hcaRpc(() =>
        config.publicClient.readContract({
          address: profile.contracts.standaloneFactory,
          abi: standaloneHcaFactoryV2DeploymentAbi,
          functionName: "authorizedOwnerOf",
          args: [hca],
          blockNumber,
        }),
      );

      return owner === zeroAddress ? null : owner;
    }),
  ),
);
