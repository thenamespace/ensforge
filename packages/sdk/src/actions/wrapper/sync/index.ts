import type { Like } from "../../../client/types.js";
import type * as Errors from "../../../errors/index.js";
import * as Action from "../../../internal/action/index.js";
import type { Plan } from "../../../plan/Plan.js";
import type { Write } from "../../../Types.js";
import * as Impl from "./effect.js";

/**
 * Brings the NameWrapper's expiry of wrapped `.eth` names up to their registration's. Resolves once the transaction is submitted.
 *
 * **When to use**
 *
 * Use when `migration.get` reports `wrapper-out-of-sync`: the name was renewed without the
 * NameWrapper being told, so after its old expiry the NameWrapper shows it with no owner or
 * fuses. Use {@link syncSync} to wait for the receipt.
 *
 * **Details**
 *
 * - Calls `ETHRenewerV1.syncWrapper`, which anyone may call; it changes nothing but the
 *   NameWrapper's expiry.
 * - Renewing through `registration.renew` syncs the NameWrapper as well.
 *
 * **Example** (Syncing a name before migrating it)
 *
 * ```ts
 * const { hash } = await ens.wrapper.sync({ names: "alice.eth" })
 * ```
 *
 * **Example** (Syncing a name with a standalone call)
 *
 * ```ts
 * import { Actions } from "@ensforge/sdk"
 *
 * await Actions.wrapper.sync(ens, { names: "alice.eth" })
 * ```
 *
 * **Example** (Syncing a name in an Effect program)
 *
 * ```ts
 * import { Actions } from "@ensforge/sdk/effect"
 *
 * yield* Actions.wrapper.sync(ens, { names: "alice.eth" })
 * ```
 *
 * @throws `Errors.InvalidInputError` (`INVALID_NAME`) for names that are not `.eth` second-level names.
 * @throws `Errors.UnsupportedError` (`UNSUPPORTED_ON_DEPLOYMENT`) without ENSv2.
 * @throws `Errors.UserRejectedError` (`USER_REJECTED`) when the user rejects the request.
 * @throws `Errors.WalletError` (`CHAIN_MISMATCH`, `ACCOUNT_NOT_FOUND`) when the wallet is on another chain or has no account to sign with.
 * @throws `Errors.UnsupportedError` (`WALLET_BATCH_UNSUPPORTED`) with `mode: "batch"` or a paymaster when the wallet cannot send calls as one batch.
 *
 * @see {@link Actions.migration.get} for the `wrapper-out-of-sync` blocker
 * @stability stable
 * @category writing
 * @since 1.2.0
 */
export function sync(
  client: Like,
  options: sync.Options & Write.Options,
): Promise<sync.ReturnType> {
  return Action.promise("wrapper.sync", Impl.sync, client, options);
}

export declare namespace sync {
  /** Options for {@link sync}. */
  type Options = {
    /** Wrapped `.eth` second-level names. Normalized automatically. */
    names: string | readonly string[];
  };
  /** Submitted transaction hashes and the plan that produced them. */
  type ReturnType = Write.Result;
  /** Errors {@link sync} can fail with. */
  type ErrorType = Errors.WriteError | Errors.InvalidInputError;
}

// Explicit types keep these declarations free of Effect types.

/** Builds the plan without sending anything. */
sync.prepare = Action.promiseOf("wrapper.sync.prepare", Impl.syncMethods.prepare) as Write.Method<
  sync.Options,
  Plan
>;

/** Simulates the plan with `eth_call`, reporting each step. */
sync.simulate = Action.promiseOf(
  "wrapper.sync.simulate",
  Impl.syncMethods.simulate,
) as Write.Method<sync.Options, Plan.Simulation>;

/** Estimates the gas and ETH the plan needs. */
sync.estimateGas = Action.promiseOf(
  "wrapper.sync.estimateGas",
  Impl.syncMethods.estimateGas,
) as Write.Method<sync.Options, Plan.Estimate>;

/**
 * Brings the NameWrapper's expiry of wrapped `.eth` names up to their registration's. Resolves once the receipt is in.
 *
 * **When to use**
 *
 * Use when the next step depends on the change being on-chain, such as migrating the name.
 *
 * **Example** (Syncing a name and waiting)
 *
 * ```ts
 * const { receipt } = await ens.wrapper.syncSync({ names: "alice.eth" })
 * ```
 *
 * **Example** (Waiting with a standalone call)
 *
 * ```ts
 * import { Actions } from "@ensforge/sdk"
 *
 * await Actions.wrapper.syncSync(ens, { names: "alice.eth" })
 * ```
 *
 * **Example** (Waiting in an Effect program)
 *
 * ```ts
 * import { Actions } from "@ensforge/sdk/effect"
 *
 * yield* Actions.wrapper.syncSync(ens, { names: "alice.eth" })
 * ```
 *
 * @throws `Errors.InvalidInputError` (`INVALID_NAME`) for names that are not `.eth` second-level names.
 * @throws `Errors.UnsupportedError` (`UNSUPPORTED_ON_DEPLOYMENT`) without ENSv2.
 * @throws `Errors.TransactionError` (`TRANSACTION_REVERTED`, `RECEIPT_TIMEOUT`, `NONCE_CONFLICT`) when confirmation fails or the wallet's nonce is already used.
 *
 * @see {@link sync} to resolve on submission
 * @stability stable
 * @category writing
 * @since 1.2.0
 */
export function syncSync(client: Like, options: syncSync.Options): Promise<syncSync.ReturnType> {
  return Action.promise("wrapper.syncSync", Impl.syncSync, client, options);
}

export declare namespace syncSync {
  /** Options for {@link syncSync}. */
  type Options = sync.Options & Write.SyncOptions;
  /** Receipts plus the submitted hashes and plan. */
  type ReturnType = Write.SyncResult;
  /** Errors {@link syncSync} can fail with. */
  type ErrorType = Errors.WriteError | Errors.InvalidInputError;
}

/** Path of the action, e.g. for cache keys. */
sync.path = "wrapper.sync" as const;

/** Path of the action, e.g. for cache keys. */
syncSync.path = "wrapper.syncSync" as const;
