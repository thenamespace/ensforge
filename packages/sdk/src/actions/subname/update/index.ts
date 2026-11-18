import type { Like } from "../../../client/types.js";
import type { AnyError } from "../../../errors/types.js";
import * as Action from "../../../internal/action/index.js";
import type { Plan } from "../../../plan/Plan.js";
import type { Write } from "../../../Types.js";
import * as Impl from "./effect.js";

/**
 * Changes a subname from its parent: owner, resolver or expiry, in one plan. Resolves once the transaction is submitted.
 *
 * **When to use**
 *
 * Use to repoint or extend names you gave out without asking their owners. Use {@link updateSync} to wait for the receipt.
 *
 * **Details**
 *
 * - ENSv2: `setResolver` and `renew` in the parent's subregistry. The owner moves with
 *   {@link Actions.name.transfer}, or by removing and recreating the child. On the deployment's
 *   current UserRegistry, extending the expiry needs the `renew` role at the subregistry's root;
 *   older registries also accept it on the child.
 * - ENSv1: one `setSubnodeRecord` keeps what is not changed; wrapped children extend their
 *   expiry with `extendExpiry`. Unwrapped ENSv1 subnames have no expiry. Under an unwrapped
 *   parent the registry rewrites a wrapped child, which unwraps it.
 *
 * **Gotchas**
 *
 * - An expired wrapped child the parent still controls keeps its owner, and the parent extends
 *   it. An emancipated child loses its owner when it expires: recreate it with
 *   {@link Actions.subname.create}.
 *
 * **Example** (Repointing a subname)
 *
 * ```ts
 * const { hash } = await ens.subname.update({ name: "pay.alice.eth", resolver: "0x231b0Ee14048e9dCcD1d247744d114a4EB5E8E63" })
 * ```
 *
 * **Example** (Repointing a subname with a standalone call)
 *
 * ```ts
 * import { Actions } from "@ensforge/sdk"
 *
 * await Actions.subname.update(ens, { name: "pay.alice.eth", resolver: "0x231b0Ee14048e9dCcD1d247744d114a4EB5E8E63" })
 * ```
 *
 * **Example** (Repointing a subname in an Effect program)
 *
 * ```ts
 * import { Actions } from "@ensforge/sdk/effect"
 *
 * yield* Actions.subname.update(ens, { name: "pay.alice.eth", resolver: "0x231b0Ee14048e9dCcD1d247744d114a4EB5E8E63" })
 * ```
 *
 * @throws `Errors.InvalidInputError` (`INVALID_NAME`, `INVALID_ADDRESS`, `INVALID_RECORD_VALUE`, `INVALID_EXPIRY`) for invalid input.
 * @throws `Errors.NameStateError` (`NAME_NOT_REGISTERED`, `NAME_EXPIRED`) when the child or parent does not exist, or an emancipated child expired.
 * @throws `Errors.UnsupportedError` (`UNSUPPORTED_PROTOCOL`) for an ENSv2 owner change or an unwrapped ENSv1 expiry.
 * @throws `Errors.UnauthorizedError` (`MISSING_ROLES`, `NOT_OWNER`, `FUSE_BURNED`) when the account may not change it.
 * @throws `Errors.UserRejectedError` when the user rejects the request.
 *
 * @see {@link Actions.name.get} to read the child
 * @stability stable
 * @category writing
 * @since 1.0.0
 */
export function update(
  client: Like,
  options: update.Options & Write.Options,
): Promise<update.ReturnType> {
  return Action.promise("subname.update", Impl.update, client, options);
}

export declare namespace update {
  /** Options for {@link update}. */
  type Options = {
    /** Full name of the child. Normalized automatically. */
    name: string;
    /** New owner (ENSv1 only). */
    owner?: string | undefined;
    /** New resolver, or `null` to remove it. */
    resolver?: string | null | undefined;
    /** New expiry as a Unix timestamp; it can only grow. */
    expiry?: bigint | undefined;
  };
  /** Submitted transaction hashes and the plan that produced them. */
  type ReturnType = Write.Result;
  /** Errors {@link update} can fail with. */
  type ErrorType = AnyError;
}

// Explicit types keep these declarations free of Effect types.

/** Builds the plan without sending anything. */
update.prepare = Action.promiseOf(
  "subname.update.prepare",
  Impl.updateMethods.prepare,
) as Write.Method<update.Options, Plan>;

/** Simulates the plan with `eth_call`, reporting each step. */
update.simulate = Action.promiseOf(
  "subname.update.simulate",
  Impl.updateMethods.simulate,
) as Write.Method<update.Options, Plan.Simulation>;

/** Estimates the gas and ETH the plan needs. */
update.estimateGas = Action.promiseOf(
  "subname.update.estimateGas",
  Impl.updateMethods.estimateGas,
) as Write.Method<update.Options, Plan.Estimate>;

/**
 * Changes a subname from its parent: owner, resolver or expiry, in one plan. Resolves once the receipt is in.
 *
 * **When to use**
 *
 * Use when the next step depends on the change being on-chain.
 *
 * **Example** (Repointing a subname and waiting)
 *
 * ```ts
 * const { receipt } = await ens.subname.updateSync({ name: "pay.alice.eth", resolver: "0x231b0Ee14048e9dCcD1d247744d114a4EB5E8E63" })
 * ```
 *
 * **Example** (Waiting with a standalone call)
 *
 * ```ts
 * import { Actions } from "@ensforge/sdk"
 *
 * await Actions.subname.updateSync(ens, { name: "pay.alice.eth", resolver: "0x231b0Ee14048e9dCcD1d247744d114a4EB5E8E63" })
 * ```
 *
 * **Example** (Waiting in an Effect program)
 *
 * ```ts
 * import { Actions } from "@ensforge/sdk/effect"
 *
 * yield* Actions.subname.updateSync(ens, { name: "pay.alice.eth", resolver: "0x231b0Ee14048e9dCcD1d247744d114a4EB5E8E63" })
 * ```
 *
 * @throws `Errors.InvalidInputError` (`INVALID_NAME`, `INVALID_ADDRESS`, `INVALID_RECORD_VALUE`, `INVALID_EXPIRY`) for invalid input.
 * @throws `Errors.NameStateError` (`NAME_NOT_REGISTERED`, `NAME_EXPIRED`) when the child or parent does not exist, or an emancipated child expired.
 * @throws `Errors.UnsupportedError` (`UNSUPPORTED_PROTOCOL`) for an ENSv2 owner change or an unwrapped ENSv1 expiry.
 * @throws `Errors.UnauthorizedError` (`MISSING_ROLES`, `NOT_OWNER`, `FUSE_BURNED`) when the account may not change it.
 * @throws `Errors.TransactionError` (`TRANSACTION_REVERTED`, `RECEIPT_TIMEOUT`) when confirmation fails.
 *
 * @see {@link update} to resolve on submission
 * @stability stable
 * @category writing
 * @since 1.0.0
 */
export function updateSync(
  client: Like,
  options: updateSync.Options,
): Promise<updateSync.ReturnType> {
  return Action.promise("subname.updateSync", Impl.updateSync, client, options);
}

export declare namespace updateSync {
  /** Options for {@link updateSync}. */
  type Options = update.Options & Write.SyncOptions;
  /** Receipts plus the submitted hashes and plan. */
  type ReturnType = Write.SyncResult;
  /** Errors {@link updateSync} can fail with. */
  type ErrorType = AnyError;
}

/** Path of the action, e.g. for cache keys. */
update.path = "subname.update" as const;

/** Path of the action, e.g. for cache keys. */
updateSync.path = "subname.updateSync" as const;
