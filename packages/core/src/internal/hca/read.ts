import { Effect } from "effect";

import type { HcaDeploymentProfile } from "@ensforge/contracts/internal";

import type { BlockParameters } from "../../action/block.js";
import type { EnsforgeConfig } from "../../config/config.js";
import type { WriteError } from "../../write/types.js";
import { executeRead } from "../read/execute-read.js";
import { ReadContext } from "../read/execution-context.js";
import { hcaRpc, resolveHcaProfile } from "./context.js";

export const withHcaSnapshot = <A>(
  config: EnsforgeConfig,
  parameters: BlockParameters,
  read: (profile: HcaDeploymentProfile, blockNumber: bigint) => Effect.Effect<A, WriteError>,
): Effect.Effect<A, WriteError> =>
  executeRead(
    config,
    { ...parameters, consistency: "snapshot" },
    Effect.gen(function* () {
      const profile = yield* resolveHcaProfile(config);
      const context = yield* ReadContext;

      const blockNumber =
        context.block.blockNumber ?? (yield* hcaRpc(() => config.publicClient.getBlockNumber()));

      return yield* read(profile, blockNumber);
    }),
  );
