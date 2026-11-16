import { Effect } from "effect";

import { defineReadAction } from "../../../action/read-request.js";
import type { EnsforgeConfig } from "../../../config/config.js";
import { executeRead } from "../../../internal/read/execute-read.js";
import { DeploymentService } from "../../../internal/services/deployment.js";
import { analyzeName } from "../../../names/analyze.js";
import { labelhash, namehash } from "../../../names/hashes.js";
import { normalizeName } from "../../../names/normalize.js";
import { getMigrationStatus } from "../get-migration-status/index.js";
import type { MigrationNameParameters, MigrationReadError, MigrationTarget } from "../types.js";

const getMigrationTargetEffect = Effect.fn("ensforge.getMigrationTarget")(function* (
  config: EnsforgeConfig,
  parameters: MigrationNameParameters,
) {
  const name = yield* normalizeName.effect(parameters.name);

  return yield* executeRead(
    config,
    parameters,
    Effect.gen(function* () {
      const status = yield* getMigrationStatus.effect(config, parameters);

      if (
        status.status === "unsupported" ||
        status.status === "not-required" ||
        status.status === "locked-child-pending-parent" ||
        status.status === "migrated-unlocked" ||
        status.status === "migrated-locked"
      ) {
        return {
          supported: false,
          name,
          reason:
            status.status === "locked-child-pending-parent"
              ? "PARENT_NOT_MIGRATED"
              : status.status === "unsupported"
                ? "MIGRATION_UNSUPPORTED"
                : "MIGRATION_NOT_REQUIRED",
        } as const;
      }

      const { profile } = yield* DeploymentService;

      if (profile.protocol !== "v2" || profile.v1 === undefined) {
        return { supported: false, name, reason: "MIGRATION_UNSUPPORTED" } as const;
      }

      if (status.status === "mirrored-child") {
        return {
          supported: true,
          name,
          route: "locked-child",
          tokenContract: profile.v1.contracts.nameWrapper,
          tokenId: BigInt(namehash(name)),
          tokenStandard: "erc1155",
          receiver: status.parentRegistry,
        } as const;
      }

      const analysis = analyzeName(name);
      const label = analysis.ethSecondLevelLabel;

      if (label === undefined) {
        return { supported: false, name, reason: "MIGRATION_UNSUPPORTED" } as const;
      }

      if (status.status === "reserved-unwrapped") {
        return {
          supported: true,
          name,
          route: "unwrapped",
          tokenContract: profile.v1.contracts.baseRegistrar,
          tokenId: BigInt(labelhash(label)),
          tokenStandard: "erc721",
          receiver: profile.v2.migration.unlockedMigrationController,
        } as const;
      }

      return {
        supported: true,
        name,
        route: status.status === "reserved-wrapped-locked" ? "wrapped-locked" : "wrapped-unlocked",
        tokenContract: profile.v1.contracts.nameWrapper,
        tokenId: BigInt(namehash(name)),
        tokenStandard: "erc1155",
        receiver:
          status.status === "reserved-wrapped-locked"
            ? profile.v2.migration.lockedMigrationController
            : profile.v2.migration.unlockedMigrationController,
      } as const;
    }),
  );
});

export const getMigrationTarget = defineReadAction<
  MigrationNameParameters,
  MigrationTarget,
  MigrationReadError
>(getMigrationTargetEffect);

export type {
  MigrationNameParameters as GetMigrationTargetParameters,
  MigrationReadError as GetMigrationTargetError,
  MigrationTarget,
} from "../types.js";
