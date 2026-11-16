import type { Like } from "../../../client/types.js";
import type { AnyError } from "../../../errors/types.js";
import * as Action from "../../../internal/action/index.js";
import type { Plan } from "../../../plan/Plan.js";
import type { Write } from "../../../Types.js";
import type { PaymentToken } from "../../registration/types.js";
import type { NameInput } from "../types.js";
import * as Impl from "./effect.js";

/**
 * Migrates one or more ENSv1 names to ENSv2, carrying their resolver records and subnames. Resolves once the transaction is submitted.
 *
 * **When to use**
 *
 * Use to upgrade `.eth` names (unwrapped, wrapped or locked) and locked subnames to ENSv2. Use {@link migrateSync} to wait for the receipt.
 *
 * **Details**
 *
 * - Plan: renew names in grace (with `renew`) → create each name's resolver with its records,
 *   and a UserRegistry for listed `subnames` → recreate the subnames → transfer the tokens to
 *   the migration controllers (parents before locked children) → restore ENSv1 managers.
 * - Direct token transfers from the holder: no approvals are needed.
 * - By default a name on an ENS public resolver gets its own PermissionedResolver; custom
 *   resolvers are kept. `resolver: "owned"` uses the signer's shared resolver (the ENS app's).
 * - Records are those given per name; with `allowIncompleteRecords`, the common ones are
 *   read from the current resolver. Locked names follow their fuses (roles, resolver).
 * - An interrupted migration can run again: existing resolvers and registries are reused.
 *
 * **Gotchas**
 *
 * - ENSv2 drops ENSv1 subnames that are not recreated (`subnames`), and records left on an
 *   ENSv1 public resolver become read-only. Pass every record to carry over.
 * - Use {@link migrateSync} to also verify the migrated state.
 *
 * **Example** (Migrating a name with its profile)
 *
 * ```ts
 * const { hash } = await ens.migration.migrate({ names: { name: "alice.eth", records: { texts: { url: "https://alice.dev" } }, subnames: ["pay"] } })
 * ```
 *
 * **Example** (Migrating a name with its profile with a standalone call)
 *
 * ```ts
 * import { Actions } from "@ensforge/core"
 *
 * await Actions.migration.migrate(ens, { names: { name: "alice.eth", records: { texts: { url: "https://alice.dev" } }, subnames: ["pay"] } })
 * ```
 *
 * **Example** (Migrating a name with its profile in an Effect program)
 *
 * ```ts
 * import { Actions } from "@ensforge/core/effect"
 *
 * yield* Actions.migration.migrate(ens, { names: { name: "alice.eth", records: { texts: { url: "https://alice.dev" } }, subnames: ["pay"] } })
 * ```
 *
 * @throws `Errors.InvalidInputError` (`INVALID_NAME`, `INVALID_ADDRESS`, `INVALID_RECORD_VALUE`) for invalid input.
 * @throws `Errors.MigrationError` (`NOT_ELIGIBLE`, `ALREADY_MIGRATED`, `RECORDS_UNKNOWN`) when a name cannot migrate as asked.
 * @throws `Errors.UnauthorizedError` (`NOT_OWNER`, `FUSE_BURNED`) when the account may not move a token.
 * @throws `Errors.UserRejectedError` when the user rejects the request.
 *
 * @see {@link Actions.migration.get} to check a name first
 * @stability stable
 * @category writing
 * @since 1.0.0
 */
export function migrate(
  client: Like,
  options: migrate.Options & Write.Options,
): Promise<migrate.ReturnType> {
  return Action.promise("migration.migrate", Impl.migrate, client, options);
}

export declare namespace migrate {
  /** Options for {@link migrate}. */
  type Options = {
    /** Names to migrate: a name, or a name with its records and subnames. */
    names: NameInput | readonly NameInput[];
    /**
     * `"new"`, `"owned"`, `"keep"` or a resolver address.
     *
     * @default "new" for names on an ENS public resolver, "keep" otherwise
     */
    resolver?: "new" | "owned" | "keep" | (string & {}) | undefined;
    /** ENSv2 owner of the names. Defaults to each token's holder. */
    owner?: string | undefined;
    /** Copy the common records when a name's records are not given. */
    allowIncompleteRecords?: boolean | undefined;
    /** Migrate even when a listed subname cannot be recreated. */
    allowLeavingSubnames?: boolean | undefined;
    /** Give each unwrapped name's ENSv1 manager `setResolver` and the record setter roles. */
    preserveManager?: boolean | undefined;
    /** Migrate the ENSv1 parents of locked subnames first. */
    migrateParents?: boolean | undefined;
    /** Renew names in their grace period first. */
    renew?:
      | { readonly duration: bigint; readonly paymentToken?: PaymentToken | undefined }
      | undefined;
  };
  /** Submitted transaction hashes and the plan that produced them. */
  type ReturnType = Write.Result;
  /** Errors {@link migrate} can fail with. */
  type ErrorType = AnyError;
}

// Explicit types keep these declarations free of Effect types.

/** Builds the plan without sending anything. */
migrate.prepare = Action.promiseOf(
  "migration.migrate.prepare",
  Impl.migrateMethods.prepare,
) as Write.Method<migrate.Options, Plan>;

/** Simulates the plan with `eth_call`, reporting each step. */
migrate.simulate = Action.promiseOf(
  "migration.migrate.simulate",
  Impl.migrateMethods.simulate,
) as Write.Method<migrate.Options, Plan.Simulation>;

/** Estimates the gas and ETH the plan needs. */
migrate.estimateGas = Action.promiseOf(
  "migration.migrate.estimateGas",
  Impl.migrateMethods.estimateGas,
) as Write.Method<migrate.Options, Plan.Estimate>;

/**
 * Migrates one or more ENSv1 names to ENSv2, carrying their resolver records and subnames. Resolves once the receipt is in.
 *
 * **When to use**
 *
 * Use when the next step depends on the migration being on-chain; once every receipt is in, each
 * name's ENSv2 owner, resolver, subregistry and copied records are checked against the plan.
 *
 * **Example** (Migrating a name with its profile and waiting)
 *
 * ```ts
 * const { receipt } = await ens.migration.migrateSync({ names: { name: "alice.eth", records: { texts: { url: "https://alice.dev" } }, subnames: ["pay"] } })
 * ```
 *
 * **Example** (Waiting with a standalone call)
 *
 * ```ts
 * import { Actions } from "@ensforge/core"
 *
 * await Actions.migration.migrateSync(ens, { names: { name: "alice.eth", records: { texts: { url: "https://alice.dev" } }, subnames: ["pay"] } })
 * ```
 *
 * **Example** (Waiting in an Effect program)
 *
 * ```ts
 * import { Actions } from "@ensforge/core/effect"
 *
 * yield* Actions.migration.migrateSync(ens, { names: { name: "alice.eth", records: { texts: { url: "https://alice.dev" } }, subnames: ["pay"] } })
 * ```
 *
 * @throws `Errors.InvalidInputError` (`INVALID_NAME`, `INVALID_ADDRESS`, `INVALID_RECORD_VALUE`) for invalid input.
 * @throws `Errors.MigrationError` (`NOT_ELIGIBLE`, `ALREADY_MIGRATED`, `RECORDS_UNKNOWN`) when a name cannot migrate as asked.
 * @throws `Errors.UnauthorizedError` (`NOT_OWNER`, `FUSE_BURNED`) when the account may not move a token.
 * @throws `Errors.TransactionError` (`TRANSACTION_REVERTED`, `RECEIPT_TIMEOUT`) when confirmation fails.
 * @throws `Errors.MigrationError` (`VERIFICATION_FAILED`) when a migrated name's ENSv2 state differs from the plan.
 *
 * @see {@link migrate} to resolve on submission
 * @stability stable
 * @category writing
 * @since 1.0.0
 */
export function migrateSync(
  client: Like,
  options: migrateSync.Options,
): Promise<migrateSync.ReturnType> {
  return Action.promise("migration.migrateSync", Impl.migrateSync, client, options);
}

export declare namespace migrateSync {
  /** Options for {@link migrateSync}. */
  type Options = migrate.Options & Write.SyncOptions;
  /** Receipts plus the submitted hashes and plan. */
  type ReturnType = Write.SyncResult;
  /** Errors {@link migrateSync} can fail with. */
  type ErrorType = AnyError;
}
