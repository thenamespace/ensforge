import type { Like } from "../../../client/types.js";
import type * as Errors from "../../../errors/index.js";
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
 *   and UserRegistries for its subnames → recreate the subnames → transfer the tokens to
 *   the migration controllers (parents before locked children) → register a locked name's
 *   subnames in its WrapperRegistry → restore ENSv1 managers.
 * - Direct token transfers from the holder: no approvals are needed.
 * - By default a name on an ENS public resolver gets its own PermissionedResolver; custom
 *   resolvers are kept. `resolver: "owned"` uses the signer's shared resolver (the ENS app's).
 * - Records and subnames are those given per name; otherwise, with an indexer, every record key
 *   it lists (values read on-chain) and the live subnames at every depth; without one,
 *   `allowIncompleteRecords` copies the common records. Records it cannot copy (a public key,
 *   an unknown key, or an incomplete list from the indexer) fail with `RECORDS_UNKNOWN` unless
 *   `allowIncompleteRecords`. ABI, interface, data and raw content-hash records are copied.
 * - A custom resolver's records are copied too when the name gets a new resolver, read through
 *   resolution, off-chain ones included (warning `RECORDS_FROM_CUSTOM_RESOLVER`).
 * - Locked names follow their fuses. A locked `cannotSetResolver` name gets an empty
 *   PublicResolverV2, which its new owner writes after the transfer: through an HCA, the signer
 *   first approves the HCA as the node's delegate, so the copy runs in the same execution.
 *   Migrating such a name with records to another `owner` fails (`records-not-replayable`)
 *   unless `allowEmptyResolver`.
 * - The sending account keeps no roles on a subname registry it deploys for someone else.
 * - An interrupted migration can run again: existing resolvers and registries are reused.
 *
 * **Gotchas**
 *
 * - ENSv2 drops ENSv1 subnames that are not recreated, and records left on an ENSv1 public
 *   resolver become read-only. Without an indexer, pass every record and subname to carry over.
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
 * import { Actions } from "@ensforge/sdk"
 *
 * await Actions.migration.migrate(ens, { names: { name: "alice.eth", records: { texts: { url: "https://alice.dev" } }, subnames: ["pay"] } })
 * ```
 *
 * **Example** (Migrating a name with its profile in an Effect program)
 *
 * ```ts
 * import { Actions } from "@ensforge/sdk/effect"
 *
 * yield* Actions.migration.migrate(ens, { names: { name: "alice.eth", records: { texts: { url: "https://alice.dev" } }, subnames: ["pay"] } })
 * ```
 *
 * @throws `Errors.InvalidInputError` (`INVALID_NAME`, `INVALID_ADDRESS`, `INVALID_RECORD_VALUE`) for invalid input.
 * @throws `Errors.MigrationError` (`NOT_ELIGIBLE`, `ALREADY_MIGRATED`, `RECORDS_UNKNOWN`, `NAME_NOT_LOCKED`) when a name cannot migrate as asked.
 * @throws `Errors.NameStateError` (`NAME_LOCKED`) when the name is locked.
 * @throws `Errors.UnsupportedError` (`UNSUPPORTED_ON_DEPLOYMENT`) where ENSv2 is not deployed.
 * @throws `Errors.UnauthorizedError` (`NOT_OWNER`, `FUSE_BURNED`) when the account may not move a token.
 * @throws `Errors.UserRejectedError` (`USER_REJECTED`) when the user rejects the request.
 * @throws `Errors.WalletError` (`CHAIN_MISMATCH`, `ACCOUNT_NOT_FOUND`) when the wallet is on another chain or has no account to sign with.
 * @throws `Errors.UnsupportedError` (`WALLET_BATCH_UNSUPPORTED`) with `mode: "batch"` or a paymaster when the wallet cannot send calls as one batch.
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
    /**
     * Migrate when not every record can be copied: the common records without an indexer, the
     * others when some keys cannot be copied or the indexer's list is incomplete.
     */
    allowIncompleteRecords?: boolean | undefined;
    /**
     * Migrate a locked `cannotSetResolver` name to another `owner` without its records: the
     * PublicResolverV2 it gets starts empty, and only its new owner can write there.
     */
    allowEmptyResolver?: boolean | undefined;
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
  type ErrorType =
    | Errors.WriteError
    | Errors.InvalidInputError
    | Errors.MigrationError
    | Errors.NameStateError
    | Errors.UnauthorizedError;
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
 * import { Actions } from "@ensforge/sdk"
 *
 * await Actions.migration.migrateSync(ens, { names: { name: "alice.eth", records: { texts: { url: "https://alice.dev" } }, subnames: ["pay"] } })
 * ```
 *
 * **Example** (Waiting in an Effect program)
 *
 * ```ts
 * import { Actions } from "@ensforge/sdk/effect"
 *
 * yield* Actions.migration.migrateSync(ens, { names: { name: "alice.eth", records: { texts: { url: "https://alice.dev" } }, subnames: ["pay"] } })
 * ```
 *
 * @throws `Errors.InvalidInputError` (`INVALID_NAME`, `INVALID_ADDRESS`, `INVALID_RECORD_VALUE`) for invalid input.
 * @throws `Errors.MigrationError` (`NOT_ELIGIBLE`, `ALREADY_MIGRATED`, `RECORDS_UNKNOWN`, `NAME_NOT_LOCKED`) when a name cannot migrate as asked.
 * @throws `Errors.NameStateError` (`NAME_LOCKED`) when the name is locked.
 * @throws `Errors.UnsupportedError` (`UNSUPPORTED_ON_DEPLOYMENT`) where ENSv2 is not deployed.
 * @throws `Errors.UnauthorizedError` (`NOT_OWNER`, `FUSE_BURNED`) when the account may not move a token.
 * @throws `Errors.TransactionError` (`TRANSACTION_REVERTED`, `RECEIPT_TIMEOUT`, `NONCE_CONFLICT`) when confirmation fails or the wallet's nonce is already used.
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
  type ErrorType =
    | Errors.WriteError
    | Errors.InvalidInputError
    | Errors.MigrationError
    | Errors.NameStateError
    | Errors.UnauthorizedError;
}

/** Path of the action, e.g. for cache keys. */
migrate.path = "migration.migrate" as const;

/** Path of the action, e.g. for cache keys. */
migrateSync.path = "migration.migrateSync" as const;
