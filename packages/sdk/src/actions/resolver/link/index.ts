import type { Like } from "../../../client/types.js";
import type * as Errors from "../../../errors/index.js";
import * as Action from "../../../internal/action/index.js";
import type { Plan } from "../../../plan/Plan.js";
import type { Write } from "../../../Types.js";
import * as Impl from "./effect.js";

/**
 * Links an ENS name to the records of another name on the same PermissionedResolver. Resolves once the transaction is submitted.
 *
 * **When to use**
 *
 * Use to make several names share one set of records, such as aliases of a main name. Use {@link linkSync} to wait for the receipt.
 *
 * **Details**
 *
 * - `to` is a name whose records the name will read and write, or a record ID from
 *   {@link Actions.resolver.getLink}.
 * - Both names must use the same PermissionedResolver, and the target must already have records.
 * - Needs the `link` role on the resolver.
 *
 * **Example** (Sharing records with another name)
 *
 * ```ts
 * const { hash } = await ens.resolver.link({ name: "alice.eth", to: "alice-main.eth" })
 * ```
 *
 * **Example** (Sharing records with another name with a standalone call)
 *
 * ```ts
 * import { Actions } from "@ensforge/sdk"
 *
 * await Actions.resolver.link(ens, { name: "alice.eth", to: "alice-main.eth" })
 * ```
 *
 * **Example** (Sharing records with another name in an Effect program)
 *
 * ```ts
 * import { Actions } from "@ensforge/sdk/effect"
 *
 * yield* Actions.resolver.link(ens, { name: "alice.eth", to: "alice-main.eth" })
 * ```
 *
 * @throws `Errors.InvalidInputError` (`INVALID_NAME`, `INVALID_RECORD_VALUE`) for invalid input or a target without records.
 * @throws `Errors.NameStateError` (`NAME_EXPIRED`, `NAME_RESERVED`, `NAME_NOT_REGISTERED`) when the name is not registered.
 * @throws `Errors.NameStateError` (`NAME_UNREACHABLE`) when ENSv2 resolution no longer reaches the name.
 * @throws `Errors.NotFoundError` (`RESOLVER_NOT_FOUND`) when the name has no resolver of its own.
 * @throws `Errors.UnsupportedError` (`RESOLVER_PROFILE_UNSUPPORTED`) when the resolver is not a PermissionedResolver.
 * @throws `Errors.UnauthorizedError` (`MISSING_ROLES`) without the `link` role.
 * @throws `Errors.UserRejectedError` (`USER_REJECTED`) when the user rejects the request.
 * @throws `Errors.WalletError` (`CHAIN_MISMATCH`, `ACCOUNT_NOT_FOUND`) when the wallet is on another chain or has no account to sign with.
 * @throws `Errors.UnsupportedError` (`WALLET_BATCH_UNSUPPORTED`) with `mode: "batch"` or a paymaster when the wallet cannot send calls as one batch.
 *
 * @see {@link Actions.resolver.getLink} to read a name's record ID
 * @stability stable
 * @category writing
 * @since 1.0.0
 */
export function link(
  client: Like,
  options: link.Options & Write.Options,
): Promise<link.ReturnType> {
  return Action.promise("resolver.link", Impl.link, client, options);
}

export declare namespace link {
  /** Options for {@link link}. */
  type Options = {
    /** ENS name. Normalized automatically. */
    name: string;
    /** Name or record ID to link to. */
    to: string | { recordId: bigint };
  };
  /** Submitted transaction hashes and the plan that produced them. */
  type ReturnType = Write.Result;
  /** Errors {@link link} can fail with. */
  type ErrorType =
    | Errors.WriteError
    | Errors.InvalidInputError
    | Errors.NameStateError
    | Errors.NotFoundError
    | Errors.UnauthorizedError;
}

// Explicit types keep these declarations free of Effect types.

/** Builds the plan without sending anything. */
link.prepare = Action.promiseOf("resolver.link.prepare", Impl.linkMethods.prepare) as Write.Method<
  link.Options,
  Plan
>;

/** Simulates the plan with `eth_call`, reporting each step. */
link.simulate = Action.promiseOf(
  "resolver.link.simulate",
  Impl.linkMethods.simulate,
) as Write.Method<link.Options, Plan.Simulation>;

/** Estimates the gas and ETH the plan needs. */
link.estimateGas = Action.promiseOf(
  "resolver.link.estimateGas",
  Impl.linkMethods.estimateGas,
) as Write.Method<link.Options, Plan.Estimate>;

/**
 * Links an ENS name to the records of another name on the same PermissionedResolver. Resolves once the receipt is in.
 *
 * **When to use**
 *
 * Use when the next step depends on the change being on-chain.
 *
 * **Example** (Sharing records with another name and waiting)
 *
 * ```ts
 * const { receipt } = await ens.resolver.linkSync({ name: "alice.eth", to: "alice-main.eth" })
 * ```
 *
 * **Example** (Waiting with a standalone call)
 *
 * ```ts
 * import { Actions } from "@ensforge/sdk"
 *
 * await Actions.resolver.linkSync(ens, { name: "alice.eth", to: "alice-main.eth" })
 * ```
 *
 * **Example** (Waiting in an Effect program)
 *
 * ```ts
 * import { Actions } from "@ensforge/sdk/effect"
 *
 * yield* Actions.resolver.linkSync(ens, { name: "alice.eth", to: "alice-main.eth" })
 * ```
 *
 * @throws `Errors.InvalidInputError` (`INVALID_NAME`, `INVALID_RECORD_VALUE`) for invalid input or a target without records.
 * @throws `Errors.NameStateError` (`NAME_EXPIRED`, `NAME_RESERVED`, `NAME_NOT_REGISTERED`) when the name is not registered.
 * @throws `Errors.NameStateError` (`NAME_UNREACHABLE`) when ENSv2 resolution no longer reaches the name.
 * @throws `Errors.NotFoundError` (`RESOLVER_NOT_FOUND`) when the name has no resolver of its own.
 * @throws `Errors.UnsupportedError` (`RESOLVER_PROFILE_UNSUPPORTED`) when the resolver is not a PermissionedResolver.
 * @throws `Errors.UnauthorizedError` (`MISSING_ROLES`) without the `link` role.
 * @throws `Errors.TransactionError` (`TRANSACTION_REVERTED`, `RECEIPT_TIMEOUT`, `NONCE_CONFLICT`) when confirmation fails or the wallet's nonce is already used.
 *
 * @see {@link link} to resolve on submission
 * @stability stable
 * @category writing
 * @since 1.0.0
 */
export function linkSync(client: Like, options: linkSync.Options): Promise<linkSync.ReturnType> {
  return Action.promise("resolver.linkSync", Impl.linkSync, client, options);
}

export declare namespace linkSync {
  /** Options for {@link linkSync}. */
  type Options = link.Options & Write.SyncOptions;
  /** Receipts plus the submitted hashes and plan. */
  type ReturnType = Write.SyncResult;
  /** Errors {@link linkSync} can fail with. */
  type ErrorType =
    | Errors.WriteError
    | Errors.InvalidInputError
    | Errors.NameStateError
    | Errors.NotFoundError
    | Errors.UnauthorizedError;
}

/** Path of the action, e.g. for cache keys. */
link.path = "resolver.link" as const;

/** Path of the action, e.g. for cache keys. */
linkSync.path = "resolver.linkSync" as const;
