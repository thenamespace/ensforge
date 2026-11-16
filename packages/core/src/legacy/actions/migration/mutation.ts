import { Effect } from "effect";

import {
  baseRegistrarV1SafeTransferFromAbi,
  baseRegistrarV1SetApprovalForAllAbi,
  nameWrapperV1SafeTransferFromAbi,
  nameWrapperV1SetApprovalForAllAbi,
  migrationHelperV2MigrateAbi,
  migrationHelperV2NameWrapperAbi,
} from "@ensforge/contracts/internal";
import { encodeAbiParameters, encodeFunctionData, isAddressEqual } from "viem";

import {
  makeWriteIntent,
  type EnsWriteIntent,
  type EnsWriteIntentPreparer,
} from "../../action/write-intent.js";
import { ContractError } from "../../errors/contract-error.js";
import { MigrationError } from "../../errors/migration-error.js";
import { makeSingleWriteAction } from "../../internal/write/single-write-action.js";
import { dnsEncodeName } from "../../names/dns.js";
import type { EthereumAddress } from "../../schemas/identity.js";
import type { CallExecutionResult, WriteError } from "../../write/types.js";
import { getMigrationEligibility } from "./get-migration-eligibility/index.js";
import { getMigrationPlan } from "./get-migration-plan/index.js";
import type {
  ApproveMigrationParameters,
  MigrateNameCallParameters,
  MigrationPlan,
  MigrationTarget,
} from "./types.js";

type ReadyPlan = Omit<Extract<MigrationPlan, { readonly status: "ready" }>, "target"> & {
  readonly target: Extract<MigrationTarget, { readonly supported: true }>;
};

interface HelperMigrationParameters {
  readonly migrations: ReadonlyArray<MigrateNameCallParameters>;
}

const migrationTuple = [
  {
    type: "tuple",
    components: [
      { name: "label", type: "string" },
      { name: "owner", type: "address" },
      { name: "subregistry", type: "address" },
      { name: "resolver", type: "address" },
    ],
  },
] as const;

const encode = (operation: string, makeData: () => `0x${string}`) =>
  Effect.try({
    try: makeData,
    catch: (cause) =>
      new ContractError({ code: "ENCODE_FAILED", message: `Unable to encode ${operation}`, cause }),
  });

export const getCompatibleMigrationHelper = Effect.fn("ensforge.migration.getCompatibleHelper")(
  function* (config: Parameters<typeof getMigrationPlan.effect>[0]) {
    const helper = config.deployments.v2?.migration.migrationHelper;
    const expectedWrapper = config.deployments.v1?.contracts.nameWrapper;

    if (helper === undefined || expectedWrapper === undefined) return null;

    const wrapper = yield* Effect.tryPromise(() =>
      config.publicClient.readContract({
        address: helper,
        abi: migrationHelperV2NameWrapperAbi,
        functionName: "NAME_WRAPPER",
      }),
    ).pipe(Effect.catch(() => Effect.succeed(null)));

    return wrapper !== null && isAddressEqual(wrapper, expectedWrapper) ? helper : null;
  },
);

const requireReadyPlan = Effect.fn("ensforge.migration.requireReadyPlan")(function* (
  config: Parameters<typeof getMigrationPlan.effect>[0],
  parameters: MigrateNameCallParameters,
  account: EthereumAddress,
) {
  const plan = yield* getMigrationPlan.effect(config, { ...parameters, account });

  switch (plan.status) {
    case "ready":
      if (!plan.target.supported) {
        return yield* new MigrationError({
          code: "MIGRATION_BLOCKED",
          message: `${plan.name} has no transferable migration target`,
        });
      }

      return plan as ReadyPlan;
    case "authorization-required":
      return yield* new MigrationError({
        code: "AUTHORIZATION_REQUIRED",
        message: `${account} is not authorized to migrate ${plan.name}`,
      });
    case "blocked":
      return yield* new MigrationError({
        code: "MIGRATION_BLOCKED",
        message: `${plan.name} cannot be migrated: ${plan.blockers.join(", ")}`,
      });
    case "not-required":
      return yield* new MigrationError({
        code: "MIGRATION_NOT_REQUIRED",
        message: `${plan.name} does not require migration`,
      });
    case "unsupported":
      return yield* new MigrationError({
        code: "MIGRATION_UNSUPPORTED",
        message: `${plan.name} cannot be migrated on this deployment`,
      });
  }
});

const approvalPreparer: EnsWriteIntentPreparer<ApproveMigrationParameters, WriteError> = Effect.fn(
  "ensforge.approveMigration.prepare",
)(function* (config, parameters, context) {
  const account = (
    typeof context.account === "string" ? context.account : context.account.address
  ) as EthereumAddress;

  const eligibility = yield* getMigrationEligibility.effect(config, {
    name: parameters.name,
    account,
  });

  if (!eligibility.target.supported || eligibility.owner === null) {
    return yield* new MigrationError({
      code: "MIGRATION_UNSUPPORTED",
      message: `${eligibility.name} has no migration token to approve`,
    });
  }

  const target = eligibility.target;

  if (!isAddressEqual(eligibility.owner, account)) {
    return yield* new MigrationError({
      code: "AUTHORIZATION_REQUIRED",
      message: `Only the token owner can approve MigrationHelper for ${eligibility.name}`,
    });
  }

  const helper = yield* getCompatibleMigrationHelper(config);

  if (helper === null) {
    return yield* new MigrationError({
      code: "MIGRATION_UNSUPPORTED",
      message: "MigrationHelper is unavailable on this deployment",
    });
  }

  return {
    to: target.tokenContract,
    data: yield* encode("approveMigration", () =>
      encodeFunctionData({
        abi:
          target.tokenStandard === "erc721"
            ? baseRegistrarV1SetApprovalForAllAbi
            : nameWrapperV1SetApprovalForAllAbi,
        functionName: "setApprovalForAll",
        args: [helper, parameters.approved ?? true],
      }),
    ),
    value: 0n,
    protocol: "v1" as const,
  };
});

const migrationPreparer: EnsWriteIntentPreparer<MigrateNameCallParameters, WriteError> = Effect.fn(
  "ensforge.migrateName.prepare",
)(function* (config, parameters, context) {
  const account = (
    typeof context.account === "string" ? context.account : context.account.address
  ) as EthereumAddress;

  const [plan, eligibility] = yield* Effect.all(
    [
      requireReadyPlan(config, parameters, account),
      getMigrationEligibility.effect(config, { name: parameters.name, account }),
    ] as const,
    { concurrency: "unbounded" },
  );

  if (eligibility.owner === null) {
    return yield* new MigrationError({
      code: "MIGRATION_BLOCKED",
      message: `Unable to determine the migration token owner for ${plan.name}`,
    });
  }

  const tokenOwner = eligibility.owner;

  const payload = yield* encode("migration payload", () =>
    encodeAbiParameters(migrationTuple, [plan.migration]),
  );

  return {
    to: plan.target.tokenContract,
    data: yield* encode("migrateName", () =>
      plan.target.tokenStandard === "erc721"
        ? encodeFunctionData({
            abi: baseRegistrarV1SafeTransferFromAbi,
            functionName: "safeTransferFrom",
            args: [tokenOwner, plan.target.receiver, plan.target.tokenId, payload],
          })
        : encodeFunctionData({
            abi: nameWrapperV1SafeTransferFromAbi,
            functionName: "safeTransferFrom",
            args: [tokenOwner, plan.target.receiver, plan.target.tokenId, 1n, payload],
          }),
    ),
    value: 0n,
    protocol: "v2" as const,
  };
});

const groupPlans = (
  plans: ReadonlyArray<{ readonly plan: ReadyPlan; readonly tokenOwner: EthereumAddress }>,
  route: "wrapped-unlocked" | "wrapped-locked" | "locked-child",
) => {
  const groups = new Map<EthereumAddress, Array<ReadyPlan["migration"]>>();

  for (const entry of plans) {
    if (entry.plan.target.route !== route) continue;

    groups.set(entry.tokenOwner, [...(groups.get(entry.tokenOwner) ?? []), entry.plan.migration]);
  }

  return [...groups.values()];
};

const helperPreparer: EnsWriteIntentPreparer<HelperMigrationParameters, WriteError> = Effect.fn(
  "ensforge.migrateNames.prepareHelper",
)(function* (config, parameters, context) {
  const account = (
    typeof context.account === "string" ? context.account : context.account.address
  ) as EthereumAddress;

  const helper = yield* getCompatibleMigrationHelper(config);

  if (helper === null) {
    return yield* new MigrationError({
      code: "MIGRATION_UNSUPPORTED",
      message: "MigrationHelper is unavailable on this deployment",
    });
  }

  const entries = yield* Effect.forEach(parameters.migrations, (migration) =>
    Effect.all(
      [
        requireReadyPlan(config, migration, account),
        getMigrationEligibility.effect(config, { name: migration.name, account }),
      ] as const,
      { concurrency: "unbounded" },
    ).pipe(
      Effect.flatMap(([plan, eligibility]) =>
        eligibility.owner === null
          ? new MigrationError({
              code: "MIGRATION_BLOCKED",
              message: `Unable to determine the migration token owner for ${plan.name}`,
            })
          : Effect.succeed({ plan, tokenOwner: eligibility.owner }),
      ),
    ),
  );

  const parentNames = new Map<string, Array<(typeof entries)[number]>>();

  for (const entry of entries) {
    if (entry.plan.target.route !== "locked-child") continue;

    const labels = entry.plan.name.split(".");
    const parent = labels.slice(1).join(".");

    parentNames.set(parent, [...(parentNames.get(parent) ?? []), entry]);
  }

  const lockedChildrenGroups = yield* Effect.forEach(
    [...parentNames.entries()],
    ([parent, children]) =>
      dnsEncodeName.effect(parent).pipe(
        Effect.map((parentName) => ({
          parentName,
          groups: groupPlans(children, "locked-child"),
        })),
      ),
  );

  return {
    to: helper,
    data: yield* encode("migrateNames", () =>
      encodeFunctionData({
        abi: migrationHelperV2MigrateAbi,
        functionName: "migrate",
        args: [
          entries
            .filter(({ plan }) => plan.target.route === "unwrapped")
            .map(({ plan }) => plan.migration),
          groupPlans(entries, "wrapped-unlocked"),
          groupPlans(entries, "wrapped-locked"),
          lockedChildrenGroups,
        ],
      }),
    ),
    value: 0n,
    protocol: "v2" as const,
  };
});

export const approveMigration = makeSingleWriteAction("approveMigration", approvalPreparer);

export const makeMigrationIntent = (
  parameters: MigrateNameCallParameters,
): EnsWriteIntent<CallExecutionResult, WriteError> =>
  makeWriteIntent("migrateName", parameters, migrationPreparer);

export const makeMigrationHelperIntent = (
  parameters: HelperMigrationParameters,
): EnsWriteIntent<CallExecutionResult, WriteError> =>
  makeWriteIntent("migrateNames", parameters, helperPreparer);
