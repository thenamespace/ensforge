import type { Like } from "../../../client/types.js";
import type * as Errors from "../../../errors/index.js";
import * as Action from "../../../internal/action/index.js";
import type { Plan } from "../../../plan/Plan.js";
import type { Write } from "../../../Types.js";
import * as Impl from "./effect.js";

/**
 * Sets the ENSv1 registry TTL of a name. Resolves once the transaction is submitted.
 *
 * **When to use**
 *
 * Use to change how long resolvers may cache the name's records. Use {@link setTtlSync} to wait for the receipt.
 *
 * **Details**
 *
 * - Wrapped names change their TTL through the NameWrapper.
 * - ENSv2 has no registry TTL.
 *
 * **Example** (Setting a TTL)
 *
 * ```ts
 * const { hash } = await ens.name.setTtl({ name: "alice.eth", ttl: 3600n })
 * ```
 *
 * **Example** (Setting a TTL with a standalone call)
 *
 * ```ts
 * import { Actions } from "@ensforge/sdk"
 *
 * await Actions.name.setTtl(ens, { name: "alice.eth", ttl: 3600n })
 * ```
 *
 * **Example** (Setting a TTL in an Effect program)
 *
 * ```ts
 * import { Actions } from "@ensforge/sdk/effect"
 *
 * yield* Actions.name.setTtl(ens, { name: "alice.eth", ttl: 3600n })
 * ```
 *
 * @throws `Errors.InvalidInputError` (`INVALID_NAME`, `INVALID_RECORD_VALUE`) for invalid input.
 * @throws `Errors.NameStateError` (`NAME_EXPIRED`, `NAME_RESERVED`, `NAME_NOT_REGISTERED`, `NAME_EXTERNAL`) when the name is not registered, or its parent's namespace manages it outside ENS's registries.
 * @throws `Errors.NameStateError` (`NAME_UNREACHABLE`) when ENSv2 resolution no longer reaches the name.
 * @throws `Errors.UnsupportedError` (`UNSUPPORTED_PROTOCOL`) for ENSv2 names.
 * @throws `Errors.UnauthorizedError` (`NOT_OWNER`, `FUSE_BURNED`) when the account may not change it.
 * @throws `Errors.UserRejectedError` (`USER_REJECTED`) when the user rejects the request.
 * @throws `Errors.WalletError` (`CHAIN_MISMATCH`, `ACCOUNT_NOT_FOUND`) when the wallet is on another chain or has no account to sign with.
 * @throws `Errors.UnsupportedError` (`WALLET_BATCH_UNSUPPORTED`) with `mode: "batch"` or a paymaster when the wallet cannot send calls as one batch.
 *
 * @see {@link Actions.name.get} to read the name's current state
 * @stability stable
 * @category writing
 * @since 1.0.0
 */
export function setTtl(
  client: Like,
  options: setTtl.Options & Write.Options,
): Promise<setTtl.ReturnType> {
  return Action.promise("name.setTtl", Impl.setTtl, client, options);
}

export declare namespace setTtl {
  /** Options for {@link setTtl}. */
  type Options = {
    /** ENS name. Normalized automatically. */
    name: string;
    /** TTL in seconds. */
    ttl: bigint;
  };
  /** Submitted transaction hashes and the plan that produced them. */
  type ReturnType = Write.Result;
  /** Errors {@link setTtl} can fail with. */
  type ErrorType =
    | Errors.WriteError
    | Errors.InvalidInputError
    | Errors.NameStateError
    | Errors.UnauthorizedError;
}

// Explicit types keep these declarations free of Effect types.

/** Builds the plan without sending anything. */
setTtl.prepare = Action.promiseOf(
  "name.setTtl.prepare",
  Impl.setTtlMethods.prepare,
) as Write.Method<setTtl.Options, Plan>;

/** Simulates the plan with `eth_call`, reporting each step. */
setTtl.simulate = Action.promiseOf(
  "name.setTtl.simulate",
  Impl.setTtlMethods.simulate,
) as Write.Method<setTtl.Options, Plan.Simulation>;

/** Estimates the gas and ETH the plan needs. */
setTtl.estimateGas = Action.promiseOf(
  "name.setTtl.estimateGas",
  Impl.setTtlMethods.estimateGas,
) as Write.Method<setTtl.Options, Plan.Estimate>;

/**
 * Sets the ENSv1 registry TTL of a name. Resolves once the receipt is in.
 *
 * **When to use**
 *
 * Use when the next step depends on the change being on-chain.
 *
 * **Example** (Setting a TTL and waiting)
 *
 * ```ts
 * const { receipt } = await ens.name.setTtlSync({ name: "alice.eth", ttl: 3600n })
 * ```
 *
 * **Example** (Waiting with a standalone call)
 *
 * ```ts
 * import { Actions } from "@ensforge/sdk"
 *
 * await Actions.name.setTtlSync(ens, { name: "alice.eth", ttl: 3600n })
 * ```
 *
 * **Example** (Waiting in an Effect program)
 *
 * ```ts
 * import { Actions } from "@ensforge/sdk/effect"
 *
 * yield* Actions.name.setTtlSync(ens, { name: "alice.eth", ttl: 3600n })
 * ```
 *
 * @throws `Errors.InvalidInputError` (`INVALID_NAME`, `INVALID_RECORD_VALUE`) for invalid input.
 * @throws `Errors.NameStateError` (`NAME_EXPIRED`, `NAME_RESERVED`, `NAME_NOT_REGISTERED`, `NAME_EXTERNAL`) when the name is not registered, or its parent's namespace manages it outside ENS's registries.
 * @throws `Errors.NameStateError` (`NAME_UNREACHABLE`) when ENSv2 resolution no longer reaches the name.
 * @throws `Errors.UnsupportedError` (`UNSUPPORTED_PROTOCOL`) for ENSv2 names.
 * @throws `Errors.UnauthorizedError` (`NOT_OWNER`, `FUSE_BURNED`) when the account may not change it.
 * @throws `Errors.TransactionError` (`TRANSACTION_REVERTED`, `RECEIPT_TIMEOUT`, `NONCE_CONFLICT`) when confirmation fails or the wallet's nonce is already used.
 *
 * @see {@link setTtl} to resolve on submission
 * @stability stable
 * @category writing
 * @since 1.0.0
 */
export function setTtlSync(
  client: Like,
  options: setTtlSync.Options,
): Promise<setTtlSync.ReturnType> {
  return Action.promise("name.setTtlSync", Impl.setTtlSync, client, options);
}

export declare namespace setTtlSync {
  /** Options for {@link setTtlSync}. */
  type Options = setTtl.Options & Write.SyncOptions;
  /** Receipts plus the submitted hashes and plan. */
  type ReturnType = Write.SyncResult;
  /** Errors {@link setTtlSync} can fail with. */
  type ErrorType =
    | Errors.WriteError
    | Errors.InvalidInputError
    | Errors.NameStateError
    | Errors.UnauthorizedError;
}

/** Path of the action, e.g. for cache keys. */
setTtl.path = "name.setTtl" as const;

/** Path of the action, e.g. for cache keys. */
setTtlSync.path = "name.setTtlSync" as const;
