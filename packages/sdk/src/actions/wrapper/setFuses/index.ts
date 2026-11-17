import type { Like } from "../../../client/types.js";
import type { AnyError } from "../../../errors/types.js";
import * as Action from "../../../internal/action/index.js";
import type { Plan } from "../../../plan/Plan.js";
import type { Write } from "../../../Types.js";
import type * as Fuse from "../../../utils/Fuse.js";
import * as Impl from "./effect.js";

/**
 * Burns owner-controlled fuses on a wrapped ENSv1 name. Resolves once the transaction is submitted.
 *
 * **When to use**
 *
 * Use to give up powers over a name for good, such as unwrapping or changing its resolver. Use {@link setFusesSync} to wait for the receipt.
 *
 * **Details**
 *
 * - Fuses cannot be unburned before the name expires.
 * - Needs `parentCannotControl`, burned by the parent or set on every wrapped `.eth` name;
 *   every fuse besides `cannotUnwrap` needs `cannotUnwrap`.
 *
 * **Gotchas**
 *
 * - Burning `cannotUnwrap` keeps the name in the NameWrapper until it expires.
 *
 * **Example** (Burning fuses)
 *
 * ```ts
 * const { hash } = await ens.wrapper.setFuses({ name: "alice.eth", fuses: ["cannotUnwrap"] })
 * ```
 *
 * **Example** (Burning fuses with a standalone call)
 *
 * ```ts
 * import { Actions } from "@ensforge/sdk"
 *
 * await Actions.wrapper.setFuses(ens, { name: "alice.eth", fuses: ["cannotUnwrap"] })
 * ```
 *
 * **Example** (Burning fuses in an Effect program)
 *
 * ```ts
 * import { Actions } from "@ensforge/sdk/effect"
 *
 * yield* Actions.wrapper.setFuses(ens, { name: "alice.eth", fuses: ["cannotUnwrap"] })
 * ```
 *
 * @throws `Errors.InvalidInputError` (`INVALID_NAME`, `INVALID_RECORD_VALUE`) for invalid input or fuses.
 * @throws `Errors.NameStateError` (`NAME_EXPIRED`, `NAME_NOT_REGISTERED`, `NAME_NOT_WRAPPED`) when the name is not wrapped.
 * @throws `Errors.UnsupportedError` (`UNSUPPORTED_PROTOCOL`) for ENSv2 names; migrated names have no NameWrapper.
 * @throws `Errors.UnauthorizedError` (`NOT_OWNER`, `FUSE_BURNED`) when the account may not burn them.
 * @throws `Errors.UserRejectedError` when the user rejects the request.
 *
 * @see {@link Actions.wrapper.getFuses} to read them
 * @stability stable
 * @category writing
 * @since 1.0.0
 */
export function setFuses(
  client: Like,
  options: setFuses.Options & Write.Options,
): Promise<setFuses.ReturnType> {
  return Action.promise("wrapper.setFuses", Impl.setFuses, client, options);
}

export declare namespace setFuses {
  /** Options for {@link setFuses}. */
  type Options = {
    /** Wrapped ENSv1 name. Normalized automatically. */
    name: string;
    /** Owner-controlled fuses to burn. */
    fuses: readonly Fuse.Name[];
  };
  /** Submitted transaction hashes and the plan that produced them. */
  type ReturnType = Write.Result;
  /** Errors {@link setFuses} can fail with. */
  type ErrorType = AnyError;
}

// Explicit types keep these declarations free of Effect types.

/** Builds the plan without sending anything. */
setFuses.prepare = Action.promiseOf(
  "wrapper.setFuses.prepare",
  Impl.setFusesMethods.prepare,
) as Write.Method<setFuses.Options, Plan>;

/** Simulates the plan with `eth_call`, reporting each step. */
setFuses.simulate = Action.promiseOf(
  "wrapper.setFuses.simulate",
  Impl.setFusesMethods.simulate,
) as Write.Method<setFuses.Options, Plan.Simulation>;

/** Estimates the gas and ETH the plan needs. */
setFuses.estimateGas = Action.promiseOf(
  "wrapper.setFuses.estimateGas",
  Impl.setFusesMethods.estimateGas,
) as Write.Method<setFuses.Options, Plan.Estimate>;

/**
 * Burns owner-controlled fuses on a wrapped ENSv1 name. Resolves once the receipt is in.
 *
 * **When to use**
 *
 * Use when the next step depends on the change being on-chain.
 *
 * **Example** (Burning fuses and waiting)
 *
 * ```ts
 * const { receipt } = await ens.wrapper.setFusesSync({ name: "alice.eth", fuses: ["cannotUnwrap"] })
 * ```
 *
 * **Example** (Waiting with a standalone call)
 *
 * ```ts
 * import { Actions } from "@ensforge/sdk"
 *
 * await Actions.wrapper.setFusesSync(ens, { name: "alice.eth", fuses: ["cannotUnwrap"] })
 * ```
 *
 * **Example** (Waiting in an Effect program)
 *
 * ```ts
 * import { Actions } from "@ensforge/sdk/effect"
 *
 * yield* Actions.wrapper.setFusesSync(ens, { name: "alice.eth", fuses: ["cannotUnwrap"] })
 * ```
 *
 * @throws `Errors.InvalidInputError` (`INVALID_NAME`, `INVALID_RECORD_VALUE`) for invalid input or fuses.
 * @throws `Errors.NameStateError` (`NAME_EXPIRED`, `NAME_NOT_REGISTERED`, `NAME_NOT_WRAPPED`) when the name is not wrapped.
 * @throws `Errors.UnsupportedError` (`UNSUPPORTED_PROTOCOL`) for ENSv2 names; migrated names have no NameWrapper.
 * @throws `Errors.UnauthorizedError` (`NOT_OWNER`, `FUSE_BURNED`) when the account may not burn them.
 * @throws `Errors.TransactionError` (`TRANSACTION_REVERTED`, `RECEIPT_TIMEOUT`) when confirmation fails.
 *
 * @see {@link setFuses} to resolve on submission
 * @stability stable
 * @category writing
 * @since 1.0.0
 */
export function setFusesSync(
  client: Like,
  options: setFusesSync.Options,
): Promise<setFusesSync.ReturnType> {
  return Action.promise("wrapper.setFusesSync", Impl.setFusesSync, client, options);
}

export declare namespace setFusesSync {
  /** Options for {@link setFusesSync}. */
  type Options = setFuses.Options & Write.SyncOptions;
  /** Receipts plus the submitted hashes and plan. */
  type ReturnType = Write.SyncResult;
  /** Errors {@link setFusesSync} can fail with. */
  type ErrorType = AnyError;
}
