import type { Like } from "../../../client/types.js";
import type { AnyError } from "../../../errors/types.js";
import * as Action from "../../../internal/action/index.js";
import type { Plan } from "../../../plan/Plan.js";
import type { Write } from "../../../Types.js";
import * as Impl from "./effect.js";

/**
 * Removes a subname. Resolves once the transaction is submitted.
 *
 * **When to use**
 *
 * Use to take back a name you gave out, or to drop your own subname. Use {@link removeSync} to wait for the receipt.
 *
 * **Details**
 *
 * - ENSv2: `unregister` in the parent's subregistry, which also clears the child's resolver and
 *   subregistry so nothing carries over to a later owner.
 * - ENSv1: owner and resolver are set to zero, from the parent when the signer controls it,
 *   otherwise as the child's owner.
 *
 * **Gotchas**
 *
 * - Emancipated children (ENSv1 `parentCannotControl`, or an emancipated ENSv2 subregistry)
 *   cannot be removed by their parent.
 *
 * **Example** (Removing a subname)
 *
 * ```ts
 * const { hash } = await ens.subname.remove({ name: "pay.alice.eth" })
 * ```
 *
 * **Example** (Removing a subname with a standalone call)
 *
 * ```ts
 * import { Actions } from "@ensforge/sdk"
 *
 * await Actions.subname.remove(ens, { name: "pay.alice.eth" })
 * ```
 *
 * **Example** (Removing a subname in an Effect program)
 *
 * ```ts
 * import { Actions } from "@ensforge/sdk/effect"
 *
 * yield* Actions.subname.remove(ens, { name: "pay.alice.eth" })
 * ```
 *
 * @throws `Errors.InvalidInputError` (`INVALID_NAME`) for invalid input.
 * @throws `Errors.NameStateError` (`NAME_NOT_REGISTERED`, `NAME_EXPIRED`) when the child or parent does not exist.
 * @throws `Errors.UnauthorizedError` (`MISSING_ROLES`, `NOT_OWNER`, `FUSE_BURNED`) when the account may not remove it.
 * @throws `Errors.ConfigError` (`WALLET_NOT_CONFIGURED`) when no signing account is known.
 * @throws `Errors.UserRejectedError` when the user rejects the request.
 *
 * @see {@link Actions.subname.create} to create it again
 * @stability stable
 * @category writing
 * @since 1.0.0
 */
export function remove(
  client: Like,
  options: remove.Options & Write.Options,
): Promise<remove.ReturnType> {
  return Action.promise("subname.remove", Impl.remove, client, options);
}

export declare namespace remove {
  /** Options for {@link remove}. */
  type Options = {
    /** Full name of the child. Normalized automatically. */
    name: string;
  };
  /** Submitted transaction hashes and the plan that produced them. */
  type ReturnType = Write.Result;
  /** Errors {@link remove} can fail with. */
  type ErrorType = AnyError;
}

// Explicit types keep these declarations free of Effect types.

/** Builds the plan without sending anything. */
remove.prepare = Action.promiseOf(
  "subname.remove.prepare",
  Impl.removeMethods.prepare,
) as Write.Method<remove.Options, Plan>;

/** Simulates the plan with `eth_call`, reporting each step. */
remove.simulate = Action.promiseOf(
  "subname.remove.simulate",
  Impl.removeMethods.simulate,
) as Write.Method<remove.Options, Plan.Simulation>;

/** Estimates the gas and ETH the plan needs. */
remove.estimateGas = Action.promiseOf(
  "subname.remove.estimateGas",
  Impl.removeMethods.estimateGas,
) as Write.Method<remove.Options, Plan.Estimate>;

/**
 * Removes a subname. Resolves once the receipt is in.
 *
 * **When to use**
 *
 * Use when the next step depends on the change being on-chain.
 *
 * **Example** (Removing a subname and waiting)
 *
 * ```ts
 * const { receipt } = await ens.subname.removeSync({ name: "pay.alice.eth" })
 * ```
 *
 * **Example** (Waiting with a standalone call)
 *
 * ```ts
 * import { Actions } from "@ensforge/sdk"
 *
 * await Actions.subname.removeSync(ens, { name: "pay.alice.eth" })
 * ```
 *
 * **Example** (Waiting in an Effect program)
 *
 * ```ts
 * import { Actions } from "@ensforge/sdk/effect"
 *
 * yield* Actions.subname.removeSync(ens, { name: "pay.alice.eth" })
 * ```
 *
 * @throws `Errors.InvalidInputError` (`INVALID_NAME`) for invalid input.
 * @throws `Errors.NameStateError` (`NAME_NOT_REGISTERED`, `NAME_EXPIRED`) when the child or parent does not exist.
 * @throws `Errors.UnauthorizedError` (`MISSING_ROLES`, `NOT_OWNER`, `FUSE_BURNED`) when the account may not remove it.
 * @throws `Errors.ConfigError` (`WALLET_NOT_CONFIGURED`) when no signing account is known.
 * @throws `Errors.TransactionError` (`TRANSACTION_REVERTED`, `RECEIPT_TIMEOUT`) when confirmation fails.
 *
 * @see {@link remove} to resolve on submission
 * @stability stable
 * @category writing
 * @since 1.0.0
 */
export function removeSync(
  client: Like,
  options: removeSync.Options,
): Promise<removeSync.ReturnType> {
  return Action.promise("subname.removeSync", Impl.removeSync, client, options);
}

export declare namespace removeSync {
  /** Options for {@link removeSync}. */
  type Options = remove.Options & Write.SyncOptions;
  /** Receipts plus the submitted hashes and plan. */
  type ReturnType = Write.SyncResult;
  /** Errors {@link removeSync} can fail with. */
  type ErrorType = AnyError;
}
