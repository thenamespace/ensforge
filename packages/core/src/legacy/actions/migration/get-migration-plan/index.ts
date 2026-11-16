import { Effect } from "effect";

import { zeroAddress } from "viem";

import { defineReadAction } from "../../../action/read-request.js";
import type { EnsforgeConfig } from "../../../config/config.js";
import { executeRead } from "../../../internal/read/execute-read.js";
import { DeploymentService } from "../../../internal/services/deployment.js";
import { analyzeName } from "../../../names/analyze.js";
import { normalizeName } from "../../../names/normalize.js";
import type { EthereumAddress } from "../../../schemas/identity.js";
import { getMigrationEligibility } from "../get-migration-eligibility/index.js";
import type { MigrationNameParameters, MigrationPlan, MigrationReadError } from "../types.js";

export type GetMigrationPlanParameters = MigrationNameParameters & {
  readonly account: EthereumAddress;
  readonly owner?: EthereumAddress;
  readonly resolver?: EthereumAddress;
  readonly subregistry?: EthereumAddress;
};

const getMigrationPlanEffect = Effect.fn("ensforge.getMigrationPlan")(function* (
  config: EnsforgeConfig,
  parameters: GetMigrationPlanParameters,
) {
  const name = yield* normalizeName.effect(parameters.name);

  return yield* executeRead(
    config,
    parameters,
    Effect.gen(function* () {
      const eligibility = yield* getMigrationEligibility.effect(config, parameters);

      if (
        eligibility.status.status === "migrated-unlocked" ||
        eligibility.status.status === "migrated-locked"
      ) {
        return { status: "not-required", name, reason: "ALREADY_MIGRATED" } as const;
      }

      if (eligibility.status.status === "not-required") {
        return { status: "not-required", name, reason: eligibility.status.reason } as const;
      }

      if (eligibility.status.status === "unsupported") {
        return { status: "unsupported", name, blockers: eligibility.blockers } as const;
      }

      if (!eligibility.authorized && eligibility.owner !== null) {
        return {
          status: "authorization-required",
          name,
          account: parameters.account,
          owner: eligibility.owner,
          target: eligibility.target,
        } as const;
      }

      if (!eligibility.eligible || !eligibility.target.supported || eligibility.owner === null) {
        return { status: "blocked", name, blockers: eligibility.blockers } as const;
      }

      const { profile } = yield* DeploymentService;

      if (profile.protocol !== "v2") {
        return { status: "unsupported", name, blockers: ["ENSV2_NOT_ACTIVE"] } as const;
      }

      const label = analyzeName(name).label;

      if (label === undefined) {
        return { status: "unsupported", name, blockers: ["NOT_ETH_NAME"] } as const;
      }

      const locked =
        eligibility.target.route === "wrapped-locked" ||
        eligibility.target.route === "locked-child";

      return {
        status: "ready",
        name,
        target: eligibility.target,
        migration: {
          label,
          owner: parameters.owner ?? eligibility.owner,
          resolver: parameters.resolver ?? profile.v2.contracts.publicResolver,
          subregistry: locked ? zeroAddress : (parameters.subregistry ?? zeroAddress),
        },
        warnings: [
          ...(locked && parameters.subregistry !== undefined
            ? (["SUBREGISTRY_IGNORED_FOR_LOCKED_NAME"] as const)
            : []),
          ...(locked ? (["RESOLVER_MAY_BE_PRESERVED"] as const) : []),
        ],
      } satisfies MigrationPlan;
    }),
  );
});

export const getMigrationPlan = defineReadAction<
  GetMigrationPlanParameters,
  MigrationPlan,
  MigrationReadError
>(getMigrationPlanEffect);

export type { MigrationPlan, MigrationReadError as GetMigrationPlanError } from "../types.js";
