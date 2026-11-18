import type { Address } from "viem";

import type { Like } from "../../../client/types.js";
import type * as Errors from "../../../errors/index.js";
import * as Action from "../../../internal/action/index.js";
import type { Plan } from "../../../plan/Plan.js";
import type { Write } from "../../../Types.js";
import * as Impl from "./effect.js";

/**
 * Points an ENS name at a resolver. Resolves once the transaction is submitted.
 *
 * **When to use**
 *
 * Use to move a name to another resolver, or to remove it with `resolver: null`. Use {@link setSync} to wait for the receipt.
 *
 * **Details**
 *
 * - ENSv1 names change it in the ENS registry, or through the NameWrapper when wrapped.
 * - ENSv2 names change it in the registry holding them (`setResolver` on the token).
 * - `"default"` is the ENSv1 public resolver, for ENSv1 names.
 *
 * **Gotchas**
 *
 * - Records stay on the old resolver; copy them with `record.set` first.
 * - ENSv2 names have no shared default resolver: create one with {@link Actions.resolver.create}.
 *
 * **Example** (Switching to the public resolver)
 *
 * ```ts
 * const { hash } = await ens.resolver.set({ name: "alice.eth", resolver: "default" })
 * ```
 *
 * **Example** (Switching to the public resolver with a standalone call)
 *
 * ```ts
 * import { Actions } from "@ensforge/sdk"
 *
 * await Actions.resolver.set(ens, { name: "alice.eth", resolver: "default" })
 * ```
 *
 * **Example** (Switching to the public resolver in an Effect program)
 *
 * ```ts
 * import { Actions } from "@ensforge/sdk/effect"
 *
 * yield* Actions.resolver.set(ens, { name: "alice.eth", resolver: "default" })
 * ```
 *
 * @throws `Errors.InvalidInputError` (`INVALID_NAME`, `INVALID_ADDRESS`) for invalid input.
 * @throws `Errors.NameStateError` (`NAME_EXPIRED`, `NAME_RESERVED`, `NAME_NOT_REGISTERED`) when the name is not registered.
 * @throws `Errors.NameStateError` (`NAME_UNREACHABLE`) when ENSv2 resolution no longer reaches the name.
 * @throws `Errors.UnsupportedError` (`UNSUPPORTED_PROTOCOL`) for `"default"` on ENSv2 names.
 * @throws `Errors.UnauthorizedError` (`NOT_OWNER`, `MISSING_ROLES`, `FUSE_BURNED`) when the account may not change it.
 * @throws `Errors.UserRejectedError` (`USER_REJECTED`) when the user rejects the request.
 * @throws `Errors.WalletError` (`CHAIN_MISMATCH`, `ACCOUNT_NOT_FOUND`) when the wallet is on another chain or has no account to sign with.
 * @throws `Errors.UnsupportedError` (`WALLET_BATCH_UNSUPPORTED`) with `mode: "batch"` or a paymaster when the wallet cannot send calls as one batch.
 *
 * @see {@link Actions.resolver.get} to read the current resolver
 * @stability stable
 * @category writing
 * @since 1.0.0
 */
export function set(client: Like, options: set.Options & Write.Options): Promise<set.ReturnType> {
  return Action.promise("resolver.set", Impl.set, client, options);
}

export declare namespace set {
  /** Options for {@link set}. */
  type Options = {
    /** ENS name. Normalized automatically. */
    name: string;
    /**
     * New resolver, `"default"` for the ENSv1 public resolver, or `null` to remove it.
     */
    resolver: Address | "default" | null;
  };
  /** Submitted transaction hashes and the plan that produced them. */
  type ReturnType = Write.Result;
  /** Errors {@link set} can fail with. */
  type ErrorType =
    | Errors.WriteError
    | Errors.InvalidInputError
    | Errors.NameStateError
    | Errors.UnauthorizedError;
}

// Explicit types keep these declarations free of Effect types.

/** Builds the plan without sending anything. */
set.prepare = Action.promiseOf("resolver.set.prepare", Impl.setMethods.prepare) as Write.Method<
  set.Options,
  Plan
>;

/** Simulates the plan with `eth_call`, reporting each step. */
set.simulate = Action.promiseOf("resolver.set.simulate", Impl.setMethods.simulate) as Write.Method<
  set.Options,
  Plan.Simulation
>;

/** Estimates the gas and ETH the plan needs. */
set.estimateGas = Action.promiseOf(
  "resolver.set.estimateGas",
  Impl.setMethods.estimateGas,
) as Write.Method<set.Options, Plan.Estimate>;

/**
 * Points an ENS name at a resolver. Resolves once the receipt is in.
 *
 * **When to use**
 *
 * Use when the next step depends on the change being on-chain.
 *
 * **Example** (Switching to the public resolver and waiting)
 *
 * ```ts
 * const { receipt } = await ens.resolver.setSync({ name: "alice.eth", resolver: "default" })
 * ```
 *
 * **Example** (Waiting with a standalone call)
 *
 * ```ts
 * import { Actions } from "@ensforge/sdk"
 *
 * await Actions.resolver.setSync(ens, { name: "alice.eth", resolver: "default" })
 * ```
 *
 * **Example** (Waiting in an Effect program)
 *
 * ```ts
 * import { Actions } from "@ensforge/sdk/effect"
 *
 * yield* Actions.resolver.setSync(ens, { name: "alice.eth", resolver: "default" })
 * ```
 *
 * @throws `Errors.InvalidInputError` (`INVALID_NAME`, `INVALID_ADDRESS`) for invalid input.
 * @throws `Errors.NameStateError` (`NAME_EXPIRED`, `NAME_RESERVED`, `NAME_NOT_REGISTERED`) when the name is not registered.
 * @throws `Errors.NameStateError` (`NAME_UNREACHABLE`) when ENSv2 resolution no longer reaches the name.
 * @throws `Errors.UnsupportedError` (`UNSUPPORTED_PROTOCOL`) for `"default"` on ENSv2 names.
 * @throws `Errors.UnauthorizedError` (`NOT_OWNER`, `MISSING_ROLES`, `FUSE_BURNED`) when the account may not change it.
 * @throws `Errors.TransactionError` (`TRANSACTION_REVERTED`, `RECEIPT_TIMEOUT`, `NONCE_CONFLICT`) when confirmation fails or the wallet's nonce is already used.
 *
 * @see {@link set} to resolve on submission
 * @stability stable
 * @category writing
 * @since 1.0.0
 */
export function setSync(client: Like, options: setSync.Options): Promise<setSync.ReturnType> {
  return Action.promise("resolver.setSync", Impl.setSync, client, options);
}

export declare namespace setSync {
  /** Options for {@link setSync}. */
  type Options = set.Options & Write.SyncOptions;
  /** Receipts plus the submitted hashes and plan. */
  type ReturnType = Write.SyncResult;
  /** Errors {@link setSync} can fail with. */
  type ErrorType =
    | Errors.WriteError
    | Errors.InvalidInputError
    | Errors.NameStateError
    | Errors.UnauthorizedError;
}

/** Path of the action, e.g. for cache keys. */
set.path = "resolver.set" as const;

/** Path of the action, e.g. for cache keys. */
setSync.path = "resolver.setSync" as const;
