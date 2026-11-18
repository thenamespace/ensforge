import type { Like } from "../../../client/types.js";
import type * as Errors from "../../../errors/index.js";
import * as Action from "../../../internal/action/index.js";
import type { Plan } from "../../../plan/Plan.js";
import type { Write } from "../../../Types.js";
import type * as Fuse from "../../../utils/Fuse.js";
import * as Impl from "./effect.js";

/**
 * Burns fuses on, or extends, a wrapped ENSv1 subname as its parent's owner. Resolves once the transaction is submitted.
 *
 * **When to use**
 *
 * Use to emancipate a subname (`parentCannotControl`), let it renew itself (`canExtendExpiry`), or extend it. Use {@link setChildFusesSync} to wait for the receipt.
 *
 * **Details**
 *
 * - Sent by the owner of the wrapped parent.
 * - `expiry` only grows, and is capped at the parent's expiry. Burning `parentCannotControl`
 *   without `expiry` uses the parent's expiry, so the emancipated name does not expire at once.
 *
 * **Gotchas**
 *
 * - Burning `parentCannotControl` or `canExtendExpiry` needs `cannotUnwrap` on the parent
 *   (`INVALID_RECORD_VALUE`). `parentCannotControl` gives up the parent's control of the
 *   subname until it expires: the parent can then only extend it (`FUSE_BURNED` for new fuses).
 *
 * **Example** (Emancipating a subname)
 *
 * ```ts
 * const { hash } = await ens.wrapper.setChildFuses({ name: "pay.alice.eth", fuses: ["parentCannotControl"], expiry: 1_900_000_000n })
 * ```
 *
 * **Example** (Emancipating a subname with a standalone call)
 *
 * ```ts
 * import { Actions } from "@ensforge/sdk"
 *
 * await Actions.wrapper.setChildFuses(ens, { name: "pay.alice.eth", fuses: ["parentCannotControl"], expiry: 1_900_000_000n })
 * ```
 *
 * **Example** (Emancipating a subname in an Effect program)
 *
 * ```ts
 * import { Actions } from "@ensforge/sdk/effect"
 *
 * yield* Actions.wrapper.setChildFuses(ens, { name: "pay.alice.eth", fuses: ["parentCannotControl"], expiry: 1_900_000_000n })
 * ```
 *
 * @throws `Errors.InvalidInputError` (`INVALID_NAME`, `INVALID_RECORD_VALUE`, `INVALID_EXPIRY`) for invalid input or fuses.
 * @throws `Errors.NameStateError` (`NAME_EXPIRED`, `NAME_NOT_REGISTERED`, `NAME_NOT_WRAPPED`) when the name is not wrapped.
 * @throws `Errors.UnsupportedError` (`UNSUPPORTED_PROTOCOL`) for ENSv2 names; migrated names have no NameWrapper.
 * @throws `Errors.UnauthorizedError` (`NOT_OWNER`, `FUSE_BURNED`) when the account may not change it.
 * @throws `Errors.UserRejectedError` when the user rejects the request.
 *
 * @see {@link Actions.wrapper.getFuses} to read them
 * @stability stable
 * @category writing
 * @since 1.0.0
 */
export function setChildFuses(
  client: Like,
  options: setChildFuses.Options & Write.Options,
): Promise<setChildFuses.ReturnType> {
  return Action.promise("wrapper.setChildFuses", Impl.setChildFuses, client, options);
}

export declare namespace setChildFuses {
  /** Options for {@link setChildFuses}. */
  type Options = {
    /** Wrapped ENSv1 subname. Normalized automatically. */
    name: string;
    /** Fuses to burn, including the parent-controlled ones. */
    fuses?: readonly Fuse.Name[] | undefined;
    /** New expiry as a Unix timestamp. */
    expiry?: bigint | undefined;
  };
  /** Submitted transaction hashes and the plan that produced them. */
  type ReturnType = Write.Result;
  /** Errors {@link setChildFuses} can fail with. */
  type ErrorType =
    | Errors.WriteError
    | Errors.InvalidInputError
    | Errors.NameStateError
    | Errors.UnauthorizedError;
}

// Explicit types keep these declarations free of Effect types.

/** Builds the plan without sending anything. */
setChildFuses.prepare = Action.promiseOf(
  "wrapper.setChildFuses.prepare",
  Impl.setChildFusesMethods.prepare,
) as Write.Method<setChildFuses.Options, Plan>;

/** Simulates the plan with `eth_call`, reporting each step. */
setChildFuses.simulate = Action.promiseOf(
  "wrapper.setChildFuses.simulate",
  Impl.setChildFusesMethods.simulate,
) as Write.Method<setChildFuses.Options, Plan.Simulation>;

/** Estimates the gas and ETH the plan needs. */
setChildFuses.estimateGas = Action.promiseOf(
  "wrapper.setChildFuses.estimateGas",
  Impl.setChildFusesMethods.estimateGas,
) as Write.Method<setChildFuses.Options, Plan.Estimate>;

/**
 * Burns fuses on, or extends, a wrapped ENSv1 subname as its parent's owner. Resolves once the receipt is in.
 *
 * **When to use**
 *
 * Use when the next step depends on the change being on-chain.
 *
 * **Example** (Emancipating a subname and waiting)
 *
 * ```ts
 * const { receipt } = await ens.wrapper.setChildFusesSync({ name: "pay.alice.eth", fuses: ["parentCannotControl"], expiry: 1_900_000_000n })
 * ```
 *
 * **Example** (Waiting with a standalone call)
 *
 * ```ts
 * import { Actions } from "@ensforge/sdk"
 *
 * await Actions.wrapper.setChildFusesSync(ens, { name: "pay.alice.eth", fuses: ["parentCannotControl"], expiry: 1_900_000_000n })
 * ```
 *
 * **Example** (Waiting in an Effect program)
 *
 * ```ts
 * import { Actions } from "@ensforge/sdk/effect"
 *
 * yield* Actions.wrapper.setChildFusesSync(ens, { name: "pay.alice.eth", fuses: ["parentCannotControl"], expiry: 1_900_000_000n })
 * ```
 *
 * @throws `Errors.InvalidInputError` (`INVALID_NAME`, `INVALID_RECORD_VALUE`, `INVALID_EXPIRY`) for invalid input or fuses.
 * @throws `Errors.NameStateError` (`NAME_EXPIRED`, `NAME_NOT_REGISTERED`, `NAME_NOT_WRAPPED`) when the name is not wrapped.
 * @throws `Errors.UnsupportedError` (`UNSUPPORTED_PROTOCOL`) for ENSv2 names; migrated names have no NameWrapper.
 * @throws `Errors.UnauthorizedError` (`NOT_OWNER`, `FUSE_BURNED`) when the account may not change it.
 * @throws `Errors.TransactionError` (`TRANSACTION_REVERTED`, `RECEIPT_TIMEOUT`) when confirmation fails.
 *
 * @see {@link setChildFuses} to resolve on submission
 * @stability stable
 * @category writing
 * @since 1.0.0
 */
export function setChildFusesSync(
  client: Like,
  options: setChildFusesSync.Options,
): Promise<setChildFusesSync.ReturnType> {
  return Action.promise("wrapper.setChildFusesSync", Impl.setChildFusesSync, client, options);
}

export declare namespace setChildFusesSync {
  /** Options for {@link setChildFusesSync}. */
  type Options = setChildFuses.Options & Write.SyncOptions;
  /** Receipts plus the submitted hashes and plan. */
  type ReturnType = Write.SyncResult;
  /** Errors {@link setChildFusesSync} can fail with. */
  type ErrorType =
    | Errors.WriteError
    | Errors.InvalidInputError
    | Errors.NameStateError
    | Errors.UnauthorizedError;
}

/** Path of the action, e.g. for cache keys. */
setChildFuses.path = "wrapper.setChildFuses" as const;

/** Path of the action, e.g. for cache keys. */
setChildFusesSync.path = "wrapper.setChildFusesSync" as const;
