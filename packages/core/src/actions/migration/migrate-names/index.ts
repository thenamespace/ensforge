import { Effect } from "effect";

import {
  baseRegistrarV1IsApprovedForAllAbi,
  nameWrapperV1IsApprovedForAllAbi,
} from "@ensforge/contracts/internal";
import { isAddressEqual, keccak256, stringToHex } from "viem";

import { defineAction } from "../../../action/action.js";
import type { EnsforgeConfig } from "../../../config/config.js";
import { MigrationError } from "../../../errors/migration-error.js";
import { provideConfig } from "../../../internal/config/context.js";
import { viemErrorToEffectError } from "../../../internal/errors/viem-error.js";
import { resolveWalletContext } from "../../../internal/services/wallet-client.js";
import { withWorkflow } from "../../../internal/workflows/run.js";
import { normalizeName } from "../../../names/normalize.js";
import type { EthereumAddress } from "../../../schemas/identity.js";
import type { WriteError, WritePlan } from "../../../write/types.js";
import { executeWritePlan } from "../../batch/execute-write-plan.js";
import { getNameState } from "../../name/get-name-state/index.js";
import { getMigrationEligibility } from "../get-migration-eligibility/index.js";
import { getMigrationPlan } from "../get-migration-plan/index.js";
import { resolveMigrationSteps } from "../migrate-name/index.js";
import {
  approveMigration,
  getCompatibleMigrationHelper,
  makeMigrationHelperIntent,
  makeMigrationIntent,
} from "../mutation.js";
import type {
  MigrateNameCallParameters,
  MigrateNamesParameters,
  MigrationBatchApproval,
  MigrationBatchEntry,
  MigrationBatchProgress,
  MigrationNameProgress,
  MigrationPlan,
  MigrationTarget,
} from "../types.js";

type ReadyPlan = Omit<Extract<MigrationPlan, { readonly status: "ready" }>, "target"> & {
  readonly target: Extract<MigrationTarget, { readonly supported: true }>;
};

type ReadyEntry = {
  readonly parameters: MigrateNameCallParameters;
  readonly plan: ReadyPlan;
  readonly tokenOwner: EthereumAddress;
};

const planId = (migrations: ReadonlyArray<MigrateNameCallParameters>) =>
  `migrateNames:${keccak256(
    stringToHex(
      JSON.stringify(
        migrations.map(({ name, owner, resolver, subregistry }) => ({
          name,
          owner: owner ?? null,
          resolver: resolver ?? null,
          subregistry: subregistry ?? null,
        })),
      ),
    ),
  )}`;

const readApproval = Effect.fn("ensforge.migrateNames.readApproval")(function* (
  config: EnsforgeConfig,
  entry: ReadyEntry,
  helper: EthereumAddress,
) {
  return yield* Effect.tryPromise({
    try: () =>
      config.publicClient.readContract({
        address: entry.plan.target.tokenContract,
        abi:
          entry.plan.target.tokenStandard === "erc721"
            ? baseRegistrarV1IsApprovedForAllAbi
            : nameWrapperV1IsApprovedForAllAbi,
        functionName: "isApprovedForAll",
        args: [entry.tokenOwner, helper],
      }),
    catch: (cause) => viemErrorToEffectError(cause, "readContract"),
  });
});

const migrateNamesEffect = Effect.fn("ensforge.migrateNames")(function* (
  config: EnsforgeConfig,
  parameters: MigrateNamesParameters,
): Effect.fn.Return<MigrationBatchProgress, WriteError> {
  if (parameters.migrations.length === 0) {
    return yield* new MigrationError({
      code: "INVALID_MIGRATION_BATCH",
      message: "migrateNames requires at least one migration",
    });
  }

  const migrations = yield* Effect.forEach(parameters.migrations, (migration) =>
    normalizeName.effect(migration.name).pipe(Effect.map((name) => ({ ...migration, name }))),
  );

  if (new Set(migrations.map(({ name }) => name)).size !== migrations.length) {
    return yield* new MigrationError({
      code: "INVALID_MIGRATION_BATCH",
      message: "migrateNames cannot contain duplicate names",
    });
  }

  const id = planId(migrations);

  if (parameters.resume !== undefined && parameters.resume.write.planId !== id) {
    return yield* new MigrationError({
      code: "ROUTE_CHANGED",
      message: "Migration resume data does not match the supplied batch",
    });
  }

  if (parameters.resume?.write.status === "completed") {
    const completedEntries = yield* Effect.forEach(parameters.resume.migrations, (entry) =>
      getNameState.effect(config, { name: entry.name }).pipe(
        Effect.map((finalState): MigrationBatchEntry => ({
          ...entry,
          status: entry.route === null ? "not-required" : "completed",
          finalState,
        })),
      ),
    );

    return { ...parameters.resume, status: "completed", migrations: completedEntries };
  }

  const { account } = yield* provideConfig(config, resolveWalletContext(parameters));
  const address = (typeof account === "string" ? account : account.address) as EthereumAddress;

  const initial = yield* Effect.forEach(
    migrations,
    (migration) =>
      Effect.all(
        [
          getMigrationPlan.effect(config, { ...migration, account: address }),
          resolveMigrationSteps(config, migration, address, true),
        ] as const,
        { concurrency: "unbounded" },
      ).pipe(Effect.map(([plan, steps]) => ({ migration, plan, steps }))),
    { concurrency: config.reads.concurrency },
  );

  const steps = parameters.resume?.steps ?? [
    ...new Map(
      initial.flatMap(({ steps: resolved }) => resolved).map((step) => [step.name, step]),
    ).values(),
  ];

  const readyEntries = yield* Effect.forEach(
    initial.filter(
      (entry): entry is typeof entry & { readonly plan: ReadyPlan } =>
        entry.plan.status === "ready" && entry.plan.target.supported,
    ),
    ({ migration, plan }) =>
      getMigrationEligibility.effect(config, { name: migration.name, account: address }).pipe(
        Effect.flatMap((eligibility) =>
          eligibility.owner === null
            ? new MigrationError({
                code: "MIGRATION_BLOCKED",
                message: `Unable to determine the migration token owner for ${migration.name}`,
              })
            : Effect.succeed({ parameters: migration, plan, tokenOwner: eligibility.owner }),
        ),
      ),
  );

  const helper = yield* getCompatibleMigrationHelper(config);
  const hasDependencies = initial.some(({ steps: resolved }) => resolved.length > 1);

  const approvalsWithEntries =
    helper === null || hasDependencies || readyEntries.length !== steps.length
      ? []
      : yield* Effect.forEach(readyEntries, (entry) =>
          readApproval(config, entry, helper).pipe(Effect.map((approved) => ({ entry, approved }))),
        );

  const canStageApprovals = approvalsWithEntries.every(
    ({ entry, approved }) => approved || isAddressEqual(entry.tokenOwner, address),
  );

  const strategy: MigrationBatchProgress["strategy"] =
    parameters.resume?.strategy ??
    (helper !== null &&
    readyEntries.length > 0 &&
    approvalsWithEntries.length === readyEntries.length &&
    canStageApprovals
      ? "helper"
      : "sequential");

  if (strategy === "helper" && helper === null) {
    return yield* new MigrationError({
      code: "ROUTE_CHANGED",
      message: "MigrationHelper became unavailable while resuming the migration batch",
    });
  }

  const approvals: Array<MigrationBatchApproval> = parameters.resume?.approvals
    ? [...parameters.resume.approvals]
    : [];

  const stages: Array<WritePlan["stages"][number]> = [];

  if (strategy === "helper" && helper !== null) {
    const requiredByToken = new Map<string, ReadyEntry>();
    const listedApprovals = new Set<string>();

    for (const { entry, approved } of approvalsWithEntries) {
      const key = `${entry.plan.target.tokenContract}:${entry.tokenOwner}`;

      if (parameters.resume === undefined && !listedApprovals.has(key)) {
        approvals.push({
          token: entry.plan.target.tokenContract,
          owner: entry.tokenOwner,
          operator: helper,
          required: !approved,
        });

        listedApprovals.add(key);
      }

      if (!approved) requiredByToken.set(key, entry);
    }

    if (parameters.resume !== undefined) {
      for (const approval of parameters.resume.approvals) {
        if (!approval.required) continue;

        const entry = readyEntries.find(
          (candidate) =>
            isAddressEqual(candidate.plan.target.tokenContract, approval.token) &&
            isAddressEqual(candidate.tokenOwner, approval.owner),
        );

        if (entry !== undefined) requiredByToken.set(approval.token, entry);
      }
    }

    if (requiredByToken.size > 0) {
      stages.push({
        type: "calls",
        id: "approve-migration-helper",
        calls: [...requiredByToken.values()].map((entry) =>
          approveMigration.call({ name: entry.parameters.name }),
        ),
        mode: parameters.mode ?? "auto",
        atomicity: "none",
        confirmation: { type: "confirmed" },
      });
    }

    stages.push({
      type: "calls",
      id: "migrate-with-helper",
      calls: [
        makeMigrationHelperIntent({
          migrations: readyEntries.map(({ parameters: migration }) => migration),
        }),
      ],
      mode: "sequential",
      atomicity: "none",
      confirmation: parameters.confirmation ?? { type: "confirmed" },
    });
  } else {
    for (const [index, step] of steps.entries()) {
      const requested = migrations.find(({ name }) => name === step.name);

      stages.push({
        type: "calls",
        id: `migrate-${index}-${step.name}`,
        calls: [makeMigrationIntent(requested ?? { name: step.name })],
        mode: "sequential",
        atomicity: "none",
        confirmation: parameters.confirmation ?? { type: "confirmed" },
      });
    }
  }

  if (stages.length === 0) {
    const write = {
      planId: id,
      status: "completed",
      completedStages: [],
      currentStage: null,
      nextActionAt: null,
      failure: null,
    } as const;

    const entries = yield* Effect.forEach(migrations, (migration) =>
      getNameState.effect(config, { name: migration.name }).pipe(
        Effect.map((finalState): MigrationBatchEntry => ({
          name: migration.name,
          status: "not-required",
          route: null,
          finalState,
        })),
      ),
    );

    return {
      status: "completed",
      strategy,
      migrations: entries,
      approvals,
      steps,
      write,
    };
  }

  const write = yield* executeWritePlan.effect(config, {
    plan: { id, stages },
    ...(parameters.resume === undefined ? {} : { resume: parameters.resume.write }),
    ...(parameters.walletClient === undefined ? {} : { walletClient: parameters.walletClient }),
    ...(parameters.account === undefined ? {} : { account: parameters.account }),
  });

  const completed = write.status === "completed";

  const resultEntries = yield* Effect.forEach(initial, ({ migration, plan, steps: resolved }) => {
    const route =
      plan.status === "ready" && plan.target.supported
        ? plan.target.route
        : ((resolved.at(-1)?.route ??
            parameters.resume?.migrations.find(({ name }) => name === migration.name)?.route ??
            null) as MigrationNameProgress["route"] | null);

    if (!completed) {
      return Effect.succeed({
        name: migration.name,
        status: route === null ? "not-required" : "partial",
        route,
        finalState: null,
      } satisfies MigrationBatchEntry);
    }

    return getNameState.effect(config, { name: migration.name }).pipe(
      Effect.map((finalState): MigrationBatchEntry => ({
        name: migration.name,
        status: route === null ? "not-required" : "completed",
        route,
        finalState,
      })),
    );
  });

  return {
    status: completed ? "completed" : "partial",
    strategy,
    migrations: resultEntries,
    approvals,
    steps,
    write,
  };
});

export const migrateNames = defineAction<
  MigrateNamesParameters,
  MigrationBatchProgress,
  WriteError
>(withWorkflow("migrateNames", migrateNamesEffect));

export type {
  MigrateNamesParameters,
  MigrationBatchEntry,
  MigrationBatchProgress,
} from "../types.js";
