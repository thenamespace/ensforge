import { Effect } from "effect";

import { permissionedAddressSetV2Abi } from "@ensforge/contracts/v2";
import type { Address } from "viem";

import type { BlockParameters } from "../../../action/block.js";
import { defineReadAction } from "../../../action/read-request.js";
import { hcaRpc, validateHcaAddress } from "../../../internal/hca/context.js";
import { withHcaSnapshot } from "../../../internal/hca/read.js";
import { type HcaErrorResult } from "../types.js";

export const getHcaUpgradeImplementationApproval = defineReadAction<
  BlockParameters & { readonly implementation: Address; readonly gate?: Address },
  boolean,
  HcaErrorResult
>((config, parameters) =>
  withHcaSnapshot(config, parameters, (profile, blockNumber) =>
    Effect.gen(function* () {
      const implementation = yield* validateHcaAddress(parameters.implementation);
      const address = yield* validateHcaAddress(parameters.gate ?? profile.contracts.upgradeSet);

      return yield* hcaRpc(() =>
        config.publicClient.readContract({
          address,
          abi: permissionedAddressSetV2Abi,
          functionName: "includes",
          args: [implementation],
          blockNumber,
        }),
      );
    }),
  ),
);
