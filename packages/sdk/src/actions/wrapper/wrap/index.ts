import type { Like } from "../../../client/types.js";
import type * as Errors from "../../../errors/index.js";
import * as Action from "../../../internal/action/index.js";
import type { Plan } from "../../../plan/Plan.js";
import type { Write } from "../../../Types.js";
import type * as Fuse from "../../../utils/Fuse.js";
import * as Impl from "./effect.js";

/**
 * Wraps an ENSv1 name in the NameWrapper. Resolves once the transaction is submitted.
 *
 * **When to use**
 *
 * Use to turn an ENSv1 name into an ERC-1155 token, or to burn fuses on a `.eth` name. Use {@link wrapSync} to wait for the receipt.
 *
 * **Details**
 *
 * - `.eth` second-level names: one transaction from the registrant, which may burn owner
 *   fuses (`cannotUnwrap` first).
 * - Other names: the registry owner approves the NameWrapper, if needed, then wraps.
 * - The wrapped name stays with its current holder (registrant or manager) unless `owner` is
 *   given, also when an approved operator wraps it.
 * - Keeps the current resolver unless `resolver` is given.
 *
 * **Gotchas**
 *
 * - ENSv2 has no NameWrapper. Wrapped names migrate to ENSv2 like unwrapped ones.
 * - An operator of a non-`.eth` name's manager cannot approve the NameWrapper for the manager:
 *   the manager approves it first (`NOT_APPROVED`).
 *
 * **Example** (Wrapping a name)
 *
 * ```ts
 * const { hash } = await ens.wrapper.wrap({ name: "alice.eth" })
 * ```
 *
 * **Example** (Wrapping a name with a standalone call)
 *
 * ```ts
 * import { Actions } from "@ensforge/sdk"
 *
 * await Actions.wrapper.wrap(ens, { name: "alice.eth" })
 * ```
 *
 * **Example** (Wrapping a name in an Effect program)
 *
 * ```ts
 * import { Actions } from "@ensforge/sdk/effect"
 *
 * yield* Actions.wrapper.wrap(ens, { name: "alice.eth" })
 * ```
 *
 * @throws `Errors.InvalidInputError` (`INVALID_NAME`, `INVALID_ADDRESS`, `INVALID_RECORD_VALUE`) for invalid input or fuses.
 * @throws `Errors.NameStateError` (`NAME_EXPIRED`, `NAME_NOT_REGISTERED`, `NAME_EXTERNAL`, `NAME_WRAPPED`) when the name cannot be wrapped, or its parent's namespace manages it outside ENS's registries.
 * @throws `Errors.UnsupportedError` (`UNSUPPORTED_PROTOCOL`) for ENSv2 names; migrated names have no NameWrapper.
 * @throws `Errors.UnauthorizedError` (`NOT_OWNER`, `NOT_APPROVED`) when the account does not own the name, or the manager has not approved the NameWrapper.
 * @throws `Errors.UserRejectedError` when the user rejects the request.
 *
 * @see {@link Actions.wrapper.unwrap} to unwrap it
 * @stability stable
 * @category writing
 * @since 1.0.0
 */
export function wrap(
  client: Like,
  options: wrap.Options & Write.Options,
): Promise<wrap.ReturnType> {
  return Action.promise("wrapper.wrap", Impl.wrap, client, options);
}

export declare namespace wrap {
  /** Options for {@link wrap}. */
  type Options = {
    /** ENSv1 name. Normalized automatically. */
    name: string;
    /** Owner of the wrapped name. Defaults to its current holder, else the signer. */
    owner?: string | undefined;
    /** Fuses to burn while wrapping (`.eth` second-level names only). */
    fuses?: readonly Fuse.Name[] | undefined;
    /** Resolver to set. Defaults to the current one. */
    resolver?: string | undefined;
  };
  /** Submitted transaction hashes and the plan that produced them. */
  type ReturnType = Write.Result;
  /** Errors {@link wrap} can fail with. */
  type ErrorType =
    | Errors.WriteError
    | Errors.InvalidInputError
    | Errors.NameStateError
    | Errors.UnauthorizedError;
}

// Explicit types keep these declarations free of Effect types.

/** Builds the plan without sending anything. */
wrap.prepare = Action.promiseOf("wrapper.wrap.prepare", Impl.wrapMethods.prepare) as Write.Method<
  wrap.Options,
  Plan
>;

/** Simulates the plan with `eth_call`, reporting each step. */
wrap.simulate = Action.promiseOf(
  "wrapper.wrap.simulate",
  Impl.wrapMethods.simulate,
) as Write.Method<wrap.Options, Plan.Simulation>;

/** Estimates the gas and ETH the plan needs. */
wrap.estimateGas = Action.promiseOf(
  "wrapper.wrap.estimateGas",
  Impl.wrapMethods.estimateGas,
) as Write.Method<wrap.Options, Plan.Estimate>;

/**
 * Wraps an ENSv1 name in the NameWrapper. Resolves once the receipt is in.
 *
 * **When to use**
 *
 * Use when the next step depends on the change being on-chain.
 *
 * **Example** (Wrapping a name and waiting)
 *
 * ```ts
 * const { receipt } = await ens.wrapper.wrapSync({ name: "alice.eth" })
 * ```
 *
 * **Example** (Waiting with a standalone call)
 *
 * ```ts
 * import { Actions } from "@ensforge/sdk"
 *
 * await Actions.wrapper.wrapSync(ens, { name: "alice.eth" })
 * ```
 *
 * **Example** (Waiting in an Effect program)
 *
 * ```ts
 * import { Actions } from "@ensforge/sdk/effect"
 *
 * yield* Actions.wrapper.wrapSync(ens, { name: "alice.eth" })
 * ```
 *
 * @throws `Errors.InvalidInputError` (`INVALID_NAME`, `INVALID_ADDRESS`, `INVALID_RECORD_VALUE`) for invalid input or fuses.
 * @throws `Errors.NameStateError` (`NAME_EXPIRED`, `NAME_NOT_REGISTERED`, `NAME_EXTERNAL`, `NAME_WRAPPED`) when the name cannot be wrapped, or its parent's namespace manages it outside ENS's registries.
 * @throws `Errors.UnsupportedError` (`UNSUPPORTED_PROTOCOL`) for ENSv2 names; migrated names have no NameWrapper.
 * @throws `Errors.UnauthorizedError` (`NOT_OWNER`, `NOT_APPROVED`) when the account does not own the name, or the manager has not approved the NameWrapper.
 * @throws `Errors.TransactionError` (`TRANSACTION_REVERTED`, `RECEIPT_TIMEOUT`) when confirmation fails.
 *
 * @see {@link wrap} to resolve on submission
 * @stability stable
 * @category writing
 * @since 1.0.0
 */
export function wrapSync(client: Like, options: wrapSync.Options): Promise<wrapSync.ReturnType> {
  return Action.promise("wrapper.wrapSync", Impl.wrapSync, client, options);
}

export declare namespace wrapSync {
  /** Options for {@link wrapSync}. */
  type Options = wrap.Options & Write.SyncOptions;
  /** Receipts plus the submitted hashes and plan. */
  type ReturnType = Write.SyncResult;
  /** Errors {@link wrapSync} can fail with. */
  type ErrorType =
    | Errors.WriteError
    | Errors.InvalidInputError
    | Errors.NameStateError
    | Errors.UnauthorizedError;
}

/** Path of the action, e.g. for cache keys. */
wrap.path = "wrapper.wrap" as const;

/** Path of the action, e.g. for cache keys. */
wrapSync.path = "wrapper.wrapSync" as const;
