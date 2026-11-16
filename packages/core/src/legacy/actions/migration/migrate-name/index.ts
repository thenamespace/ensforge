import { Effect } from "effect";

import { keccak256, stringToHex } from "viem";

import { defineExtendedAction } from "../../../action/action.js";
import type { EnsforgeConfig } from "../../../config/config.js";
import { MigrationError } from "../../../errors/migration-error.js";
import { provideConfig } from "../../../internal/config/context.js";
import { resolveWalletContext } from "../../../internal/services/wallet-client.js";
import { withWorkflow } from "../../../internal/workflows/run.js";
import { normalizeName } from "../../../names/normalize.js";
import type { EthereumAddress } from "../../../schemas/identity.js";
import type { WriteError, WritePlan } from "../../../write/types.js";
import { executeWritePlan } from "../../batch/execute-write-plan.js";
import { getNameState } from "../../name/get-name-state/index.js";
import { getMigrationPlan } from "../get-migration-plan/index.js";
import { getMigrationStatus } from "../get-migration-status/index.js";
import { makeMigrationIntent } from "../mutation.js";
import type {
  MigrateNameCallParameters,
  MigrateNameAction,
  MigrateNameParameters,
  MigrateNameResult,
  MigrationNameProgress,
  MigrationPlan,
} from "../types.js";

type MigrationRoute = MigrationNameProgress["route"];

type MigrationStep = MigrationNameProgress["steps"][number];

const planId = (name: string, parameters: MigrateNameParameters) =>
  `migrateName:${keccak256(
    stringToHex(
      JSON.stringify({
        name,
        owner: parameters.owner ?? null,
        resolver: parameters.resolver ?? null,
        subregistry: parameters.subregistry ?? null,
        migrateParent: parameters.migrateParent ?? true,
      }),
    ),
  )}`;

const failPlan = (plan: Exclude<MigrationPlan, { readonly status: "ready" | "not-required" }>) => {
  switch (plan.status) {
    case "authorization-required":
      return new MigrationError({
        code: "AUTHORIZATION_REQUIRED",
        message: `${plan.account} is not authorized to migrate ${plan.name}`,
      });
    case "blocked":
      return new MigrationError({
        code: "MIGRATION_BLOCKED",
        message: `${plan.name} cannot be migrated: ${plan.blockers.join(", ")}`,
      });
    case "unsupported":
      return new MigrationError({
        code: "MIGRATION_UNSUPPORTED",
        message: `${plan.name} cannot be migrated on this deployment`,
      });
  }
};

export const resolveMigrationSteps = Effect.fn("ensforge.migrateName.resolveSteps")(function* (
  config: EnsforgeConfig,
  parameters: MigrateNameCallParameters,
  account: EthereumAddress,
  migrateParent: boolean,
  seen: ReadonlySet<string> = new Set(),
): Effect.fn.Return<ReadonlyArray<MigrationStep>, WriteError> {
  const name = yield* normalizeName.effect(parameters.name);

  if (seen.has(name)) {
    return yield* new MigrationError({
      code: "MIGRATION_BLOCKED",
      message: `A cyclic parent migration dependency was detected for ${name}`,
    });
  }

  const plan = yield* getMigrationPlan.effect(config, { ...parameters, name, account });

  if (plan.status === "ready" && plan.target.supported) return [{ name, route: plan.target.route }];

  if (plan.status === "ready") {
    return yield* new MigrationError({
      code: "MIGRATION_BLOCKED",
      message: `${name} has no transferable migration target`,
    });
  }

  if (plan.status === "not-required") return [];

  if (plan.status === "blocked" && plan.blockers.includes("PARENT_NOT_MIGRATED") && migrateParent) {
    const status = yield* getMigrationStatus.effect(config, { name });

    if (status.status === "locked-child-pending-parent") {
      const parents = yield* resolveMigrationSteps(
        config,
        { name: status.parent },
        account,
        true,
        new Set([...seen, name]),
      );

      return [...parents, { name, route: "locked-child" as const }];
    }
  }

  return yield* failPlan(plan);
});

const migrateNameEffect = Effect.fn("ensforge.migrateName")(function* (
  config: EnsforgeConfig,
  parameters: MigrateNameParameters,
): Effect.fn.Return<MigrateNameResult, WriteError> {
  const name = yield* normalizeName.effect(parameters.name);
  const id = planId(name, parameters);

  if (parameters.resume !== undefined && parameters.resume.write.planId !== id) {
    return yield* new MigrationError({
      code: "ROUTE_CHANGED",
      message: "Migration resume data does not match the supplied migration",
    });
  }

  if (parameters.resume?.write.status === "completed") {
    return {
      ...parameters.resume,
      status: "completed",
      finalState: yield* getNameState.effect(config, { name }),
    };
  }

  const { account } = yield* provideConfig(config, resolveWalletContext(parameters));
  const address = (typeof account === "string" ? account : account.address) as EthereumAddress;

  const steps =
    parameters.resume?.steps ??
    (yield* resolveMigrationSteps(
      config,
      { ...parameters, name },
      address,
      parameters.migrateParent ?? true,
    ));

  if (steps.length === 0) {
    const current = yield* getMigrationPlan.effect(config, {
      ...parameters,
      name,
      account: address,
    });

    if (current.status !== "not-required") {
      return yield* new MigrationError({
        code: "ROUTE_CHANGED",
        message: `The migration route for ${name} changed while preparing the workflow`,
      });
    }

    return {
      status: "not-required",
      name,
      reason: current.reason,
      write: null,
      finalState: yield* getNameState.effect(config, { name }),
    };
  }

  const stages: WritePlan["stages"] = steps.map((step, index) => ({
    type: "calls",
    id: `migrate-${index}-${step.name}`,
    calls: [
      makeMigrationIntent({
        name: step.name,
        ...(step.name === name && parameters.owner !== undefined
          ? { owner: parameters.owner }
          : {}),
        ...(step.name === name && parameters.resolver !== undefined
          ? { resolver: parameters.resolver }
          : {}),
        ...(step.name === name && parameters.subregistry !== undefined
          ? { subregistry: parameters.subregistry }
          : {}),
      }),
    ],
    mode: "sequential",
    atomicity: "none",
    confirmation: parameters.confirmation ?? { type: "confirmed" },
  }));

  const write = yield* executeWritePlan.effect(config, {
    plan: { id, stages },
    ...(parameters.resume === undefined ? {} : { resume: parameters.resume.write }),
    ...(parameters.walletClient === undefined ? {} : { walletClient: parameters.walletClient }),
    ...(parameters.account === undefined ? {} : { account: parameters.account }),
  });

  const completed = write.status === "completed";

  return {
    status: completed ? "completed" : "partial",
    name,
    route: (steps.at(-1)?.route ?? "locked-child") as MigrationRoute,
    steps,
    write,
    finalState: completed ? yield* getNameState.effect(config, { name }) : null,
  };
});

const action = defineExtendedAction<MigrateNameParameters, MigrateNameResult, WriteError>(
  withWorkflow("migrateName", migrateNameEffect),
);

export const migrateName = Object.freeze(
  Object.defineProperty(action, "call", {
    value: makeMigrationIntent,
    enumerable: true,
    configurable: false,
    writable: false,
  }),
) as MigrateNameAction;

export type {
  MigrateNameCallParameters,
  MigrateNameAction,
  MigrateNameParameters,
  MigrateNameResult,
  MigrationNameProgress,
} from "../types.js";
