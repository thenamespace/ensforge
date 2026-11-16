import { Effect } from "effect";

import type { Address } from "viem";

import type { BlockParameters } from "../../../../action/block.js";
import { defineReadAction } from "../../../../action/read-request.js";
import { readHcaGovernanceTarget } from "../../../../internal/hca/governance.js";
import { withHcaSnapshot } from "../../../../internal/hca/read.js";
import { type HcaErrorResult } from "../../types.js";
import type { HcaGovernanceTarget } from "../types.js";

export const getHcaGovernanceOwner = defineReadAction<
  BlockParameters & { readonly target: HcaGovernanceTarget },
  Address,
  HcaErrorResult
>((config, parameters) =>
  withHcaSnapshot(config, parameters, (profile, blockNumber) =>
    Effect.gen(function* () {
      return (yield* readHcaGovernanceTarget(config, profile, parameters.target, blockNumber))
        .owner;
    }),
  ),
);
