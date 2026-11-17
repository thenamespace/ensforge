import type { Like } from "../../../client/types.js";
import type { AnyError } from "../../../errors/types.js";
import * as Action from "../../../internal/action/index.js";
import type { Plan } from "../../../plan/Plan.js";
import type { Write } from "../../../Types.js";
import * as Impl from "./effect.js";

/**
 * Approves or revokes a delegate who may edit a name's records on its public resolver. Resolves once the transaction is submitted.
 *
 * **When to use**
 *
 * Use to let another account manage a profile on a PublicResolver. Use {@link setDelegateSync} to wait for the receipt.
 *
 * **Details**
 *
 * - A delegate can edit every record of the name; for per-record access on a
 *   PermissionedResolver use {@link Actions.permission.setRecordAccess}.
 *
 * **Example** (Approving a delegate)
 *
 * ```ts
 * const { hash } = await ens.approval.setDelegate({ name: "alice.eth", delegate: "0xB0b0000000000000000000000000000000000000", approved: true })
 * ```
 *
 * **Example** (Approving a delegate with a standalone call)
 *
 * ```ts
 * import { Actions } from "@ensforge/sdk"
 *
 * await Actions.approval.setDelegate(ens, { name: "alice.eth", delegate: "0xB0b0000000000000000000000000000000000000", approved: true })
 * ```
 *
 * **Example** (Approving a delegate in an Effect program)
 *
 * ```ts
 * import { Actions } from "@ensforge/sdk/effect"
 *
 * yield* Actions.approval.setDelegate(ens, { name: "alice.eth", delegate: "0xB0b0000000000000000000000000000000000000", approved: true })
 * ```
 *
 * @throws `Errors.InvalidInputError` (`INVALID_NAME`, `INVALID_ADDRESS`) for invalid input.
 * @throws `Errors.NotFoundError` (`RESOLVER_NOT_FOUND`) when the name has no resolver.
 * @throws `Errors.UnsupportedError` (`RESOLVER_PROFILE_UNSUPPORTED`) for PermissionedResolvers.
 * @throws `Errors.UserRejectedError` when the user rejects the request.
 *
 * @see {@link Actions.approval.getDelegate} to read it
 * @stability stable
 * @category writing
 * @since 1.0.0
 */
export function setDelegate(
  client: Like,
  options: setDelegate.Options & Write.Options,
): Promise<setDelegate.ReturnType> {
  return Action.promise("approval.setDelegate", Impl.setDelegate, client, options);
}

export declare namespace setDelegate {
  /** Options for {@link setDelegate}. */
  type Options = {
    /** ENS name. Normalized automatically. */
    name: string;
    /** Account to approve or revoke. */
    delegate: string;
    /** `true` to approve the delegate, `false` to revoke it. */
    approved: boolean;
  };
  /** Submitted transaction hashes and the plan that produced them. */
  type ReturnType = Write.Result;
  /** Errors {@link setDelegate} can fail with. */
  type ErrorType = AnyError;
}

// Explicit types keep these declarations free of Effect types.

/** Builds the plan without sending anything. */
setDelegate.prepare = Action.promiseOf(
  "approval.setDelegate.prepare",
  Impl.setDelegateMethods.prepare,
) as Write.Method<setDelegate.Options, Plan>;

/** Simulates the plan with `eth_call`, reporting each step. */
setDelegate.simulate = Action.promiseOf(
  "approval.setDelegate.simulate",
  Impl.setDelegateMethods.simulate,
) as Write.Method<setDelegate.Options, Plan.Simulation>;

/** Estimates the gas and ETH the plan needs. */
setDelegate.estimateGas = Action.promiseOf(
  "approval.setDelegate.estimateGas",
  Impl.setDelegateMethods.estimateGas,
) as Write.Method<setDelegate.Options, Plan.Estimate>;

/**
 * Approves or revokes a delegate who may edit a name's records on its public resolver. Resolves once the receipt is in.
 *
 * **When to use**
 *
 * Use when the next step depends on the change being on-chain.
 *
 * **Example** (Approving a delegate and waiting)
 *
 * ```ts
 * const { receipt } = await ens.approval.setDelegateSync({ name: "alice.eth", delegate: "0xB0b0000000000000000000000000000000000000", approved: true })
 * ```
 *
 * **Example** (Waiting with a standalone call)
 *
 * ```ts
 * import { Actions } from "@ensforge/sdk"
 *
 * await Actions.approval.setDelegateSync(ens, { name: "alice.eth", delegate: "0xB0b0000000000000000000000000000000000000", approved: true })
 * ```
 *
 * **Example** (Waiting in an Effect program)
 *
 * ```ts
 * import { Actions } from "@ensforge/sdk/effect"
 *
 * yield* Actions.approval.setDelegateSync(ens, { name: "alice.eth", delegate: "0xB0b0000000000000000000000000000000000000", approved: true })
 * ```
 *
 * @throws `Errors.InvalidInputError` (`INVALID_NAME`, `INVALID_ADDRESS`) for invalid input.
 * @throws `Errors.NotFoundError` (`RESOLVER_NOT_FOUND`) when the name has no resolver.
 * @throws `Errors.UnsupportedError` (`RESOLVER_PROFILE_UNSUPPORTED`) for PermissionedResolvers.
 * @throws `Errors.TransactionError` (`TRANSACTION_REVERTED`, `RECEIPT_TIMEOUT`) when confirmation fails.
 *
 * @see {@link setDelegate} to resolve on submission
 * @stability stable
 * @category writing
 * @since 1.0.0
 */
export function setDelegateSync(
  client: Like,
  options: setDelegateSync.Options,
): Promise<setDelegateSync.ReturnType> {
  return Action.promise("approval.setDelegateSync", Impl.setDelegateSync, client, options);
}

export declare namespace setDelegateSync {
  /** Options for {@link setDelegateSync}. */
  type Options = setDelegate.Options & Write.SyncOptions;
  /** Receipts plus the submitted hashes and plan. */
  type ReturnType = Write.SyncResult;
  /** Errors {@link setDelegateSync} can fail with. */
  type ErrorType = AnyError;
}

/** Path of the action, e.g. for cache keys. */
setDelegate.path = "approval.setDelegate" as const;

/** Path of the action, e.g. for cache keys. */
setDelegateSync.path = "approval.setDelegateSync" as const;
