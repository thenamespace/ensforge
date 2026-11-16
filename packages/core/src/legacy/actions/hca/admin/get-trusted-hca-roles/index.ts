import { Effect, Schema } from "effect";

import { trustedHcaSetV2ManagementAbi } from "@ensforge/contracts/internal";
import type { Address } from "viem";

import type { BlockParameters } from "../../../../action/block.js";
import { defineReadAction } from "../../../../action/read-request.js";
import { HcaError } from "../../../../errors/hca-error.js";
import { hcaRpc, validateHcaAddress } from "../../../../internal/hca/context.js";
import { withHcaSnapshot } from "../../../../internal/hca/read.js";
import { HcaSalt, type HcaErrorResult } from "../../types.js";

export const getTrustedHcaRoles = defineReadAction<
  BlockParameters & { readonly assignee: Address; readonly resource?: bigint },
  bigint,
  HcaErrorResult
>((config, parameters) =>
  withHcaSnapshot(config, parameters, (profile, blockNumber) =>
    Effect.gen(function* () {
      const assignee = yield* validateHcaAddress(parameters.assignee);
      const resource = parameters.resource ?? 0n;

      if (!Schema.is(HcaSalt)(resource))
        return yield* new HcaError({
          code: "INVALID_PARAMETERS",
          message: "Role resource must be uint256",
        });

      const address = yield* validateHcaAddress(profile.deployment.hca?.upgradeSet);

      return yield* hcaRpc(() =>
        config.publicClient.readContract({
          address,
          abi: trustedHcaSetV2ManagementAbi,
          functionName: "roles",
          args: [resource, assignee],
          blockNumber,
        }),
      );
    }),
  ),
);
