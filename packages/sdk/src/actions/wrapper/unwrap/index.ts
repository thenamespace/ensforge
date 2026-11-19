import type { Like } from "../../../client/types.js";
import type * as Errors from "../../../errors/index.js";
import * as Action from "../../../internal/action/index.js";
import type { Plan } from "../../../plan/Plan.js";
import type { Write } from "../../../Types.js";
import * as Impl from "./effect.js";

/**
 * Unwraps an ENSv1 name from the NameWrapper. Resolves once the transaction is submitted.
 *
 * **When to use**
 *
 * Use to return a wrapped name to the ENSv1 registry (and the `.eth` registrar). Use {@link unwrapSync} to wait for the receipt.
 *
 * **Details**
 *
 * - `owner` becomes the registry owner and, for `.eth` names, the registrant. Defaults to the
 *   signer.
 * - Blocked once `cannotUnwrap` is burned.
 *
 * **Example** (Unwrapping a name)
 *
 * ```ts
 * const { hash } = await ens.wrapper.unwrap({ name: "alice.eth" })
 * ```
 *
 * **Example** (Unwrapping a name with a standalone call)
 *
 * ```ts
 * import { Actions } from "@ensforge/sdk"
 *
 * await Actions.wrapper.unwrap(ens, { name: "alice.eth" })
 * ```
 *
 * **Example** (Unwrapping a name in an Effect program)
 *
 * ```ts
 * import { Actions } from "@ensforge/sdk/effect"
 *
 * yield* Actions.wrapper.unwrap(ens, { name: "alice.eth" })
 * ```
 *
 * @throws `Errors.InvalidInputError` (`INVALID_NAME`, `INVALID_ADDRESS`) for invalid input.
 * @throws `Errors.NameStateError` (`NAME_EXPIRED`, `NAME_NOT_REGISTERED`, `NAME_EXTERNAL`, `NAME_NOT_WRAPPED`) when the name is not wrapped, or its parent's namespace manages it outside ENS's registries.
 * @throws `Errors.UnsupportedError` (`UNSUPPORTED_PROTOCOL`) for ENSv2 names; migrated names have no NameWrapper.
 * @throws `Errors.UnauthorizedError` (`NOT_OWNER`, `FUSE_BURNED`) when the account may not unwrap it.
 * @throws `Errors.UserRejectedError` when the user rejects the request.
 *
 * @see {@link Actions.wrapper.wrap} to wrap it
 * @stability stable
 * @category writing
 * @since 1.0.0
 */
export function unwrap(
  client: Like,
  options: unwrap.Options & Write.Options,
): Promise<unwrap.ReturnType> {
  return Action.promise("wrapper.unwrap", Impl.unwrap, client, options);
}

export declare namespace unwrap {
  /** Options for {@link unwrap}. */
  type Options = {
    /** ENSv1 name. Normalized automatically. */
    name: string;
    /** Owner after unwrapping. Defaults to the signer. */
    owner?: string | undefined;
  };
  /** Submitted transaction hashes and the plan that produced them. */
  type ReturnType = Write.Result;
  /** Errors {@link unwrap} can fail with. */
  type ErrorType =
    | Errors.WriteError
    | Errors.InvalidInputError
    | Errors.NameStateError
    | Errors.UnauthorizedError;
}

// Explicit types keep these declarations free of Effect types.

/** Builds the plan without sending anything. */
unwrap.prepare = Action.promiseOf(
  "wrapper.unwrap.prepare",
  Impl.unwrapMethods.prepare,
) as Write.Method<unwrap.Options, Plan>;

/** Simulates the plan with `eth_call`, reporting each step. */
unwrap.simulate = Action.promiseOf(
  "wrapper.unwrap.simulate",
  Impl.unwrapMethods.simulate,
) as Write.Method<unwrap.Options, Plan.Simulation>;

/** Estimates the gas and ETH the plan needs. */
unwrap.estimateGas = Action.promiseOf(
  "wrapper.unwrap.estimateGas",
  Impl.unwrapMethods.estimateGas,
) as Write.Method<unwrap.Options, Plan.Estimate>;

/**
 * Unwraps an ENSv1 name from the NameWrapper. Resolves once the receipt is in.
 *
 * **When to use**
 *
 * Use when the next step depends on the change being on-chain.
 *
 * **Example** (Unwrapping a name and waiting)
 *
 * ```ts
 * const { receipt } = await ens.wrapper.unwrapSync({ name: "alice.eth" })
 * ```
 *
 * **Example** (Waiting with a standalone call)
 *
 * ```ts
 * import { Actions } from "@ensforge/sdk"
 *
 * await Actions.wrapper.unwrapSync(ens, { name: "alice.eth" })
 * ```
 *
 * **Example** (Waiting in an Effect program)
 *
 * ```ts
 * import { Actions } from "@ensforge/sdk/effect"
 *
 * yield* Actions.wrapper.unwrapSync(ens, { name: "alice.eth" })
 * ```
 *
 * @throws `Errors.InvalidInputError` (`INVALID_NAME`, `INVALID_ADDRESS`) for invalid input.
 * @throws `Errors.NameStateError` (`NAME_EXPIRED`, `NAME_NOT_REGISTERED`, `NAME_EXTERNAL`, `NAME_NOT_WRAPPED`) when the name is not wrapped, or its parent's namespace manages it outside ENS's registries.
 * @throws `Errors.UnsupportedError` (`UNSUPPORTED_PROTOCOL`) for ENSv2 names; migrated names have no NameWrapper.
 * @throws `Errors.UnauthorizedError` (`NOT_OWNER`, `FUSE_BURNED`) when the account may not unwrap it.
 * @throws `Errors.TransactionError` (`TRANSACTION_REVERTED`, `RECEIPT_TIMEOUT`) when confirmation fails.
 *
 * @see {@link unwrap} to resolve on submission
 * @stability stable
 * @category writing
 * @since 1.0.0
 */
export function unwrapSync(
  client: Like,
  options: unwrapSync.Options,
): Promise<unwrapSync.ReturnType> {
  return Action.promise("wrapper.unwrapSync", Impl.unwrapSync, client, options);
}

export declare namespace unwrapSync {
  /** Options for {@link unwrapSync}. */
  type Options = unwrap.Options & Write.SyncOptions;
  /** Receipts plus the submitted hashes and plan. */
  type ReturnType = Write.SyncResult;
  /** Errors {@link unwrapSync} can fail with. */
  type ErrorType =
    | Errors.WriteError
    | Errors.InvalidInputError
    | Errors.NameStateError
    | Errors.UnauthorizedError;
}

/** Path of the action, e.g. for cache keys. */
unwrap.path = "wrapper.unwrap" as const;

/** Path of the action, e.g. for cache keys. */
unwrapSync.path = "wrapper.unwrapSync" as const;
