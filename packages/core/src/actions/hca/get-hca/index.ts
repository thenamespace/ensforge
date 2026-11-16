import { Effect } from "effect";

import { standaloneHcaV2InspectionAbi } from "@ensforge/contracts/internal";

import { defineReadAction } from "../../../action/read-request.js";
import { hcaRpc, validateHcaAddress } from "../../../internal/hca/context.js";
import { withHcaSnapshot } from "../../../internal/hca/read.js";
import type { HcaErrorResult, HcaReadParameters, HcaState } from "../types.js";

export const getHca = defineReadAction<HcaReadParameters, HcaState, HcaErrorResult>(
  (config, parameters) =>
    withHcaSnapshot(config, parameters, (_profile, blockNumber) =>
      Effect.gen(function* () {
        const address = yield* validateHcaAddress(parameters.hca);
        const code = yield* hcaRpc(() => config.publicClient.getCode({ address, blockNumber }));

        if (!code || code === "0x")
          return { status: "undeployed" as const, address, chainId: config.chainId, blockNumber };

        const request = { address, abi: standaloneHcaV2InspectionAbi, blockNumber } as const;

        const [owner, sessionNonce] = yield* hcaRpc(() =>
          config.publicClient.readContract({ ...request, functionName: "ownerAndSessionNonce" }),
        );

        const implementation = yield* hcaRpc(() =>
          config.publicClient.readContract({ ...request, functionName: "getImplementation" }),
        );

        const accountId = yield* hcaRpc(() =>
          config.publicClient.readContract({ ...request, functionName: "accountId" }),
        );

        return {
          status: "deployed" as const,
          address,
          chainId: config.chainId,
          owner,
          sessionNonce,
          implementation,
          accountId,
          blockNumber,
        };
      }),
    ),
);
