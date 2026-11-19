import type { Like } from "../../../client/types.js";
import type * as Errors from "../../../errors/index.js";
import * as Action from "../../../internal/action/index.js";
import type { Plan } from "../../../plan/Plan.js";
import type { Write } from "../../../Types.js";
import * as Impl from "./effect.js";

/**
 * Sets the ENSv1 manager (registry owner) of a name. Resolves once the transaction is submitted.
 *
 * **When to use**
 *
 * Use to let another account edit records and subnames while keeping ownership. Use {@link setManagerSync} to wait for the receipt.
 *
 * **Details**
 *
 * - Unwrapped `.eth` names: the registrant reclaims to the new manager; a manager who is not the
 *   registrant changes the registry owner directly.
 * - Other unwrapped ENSv1 names change their registry owner.
 * - Wrapped and ENSv2 names have no manager; ENSv2 uses roles instead.
 *
 * **Example** (Setting a manager)
 *
 * ```ts
 * const { hash } = await ens.name.setManager({ name: "alice.eth", manager: "0xB0b0000000000000000000000000000000000000" })
 * ```
 *
 * **Example** (Setting a manager with a standalone call)
 *
 * ```ts
 * import { Actions } from "@ensforge/sdk"
 *
 * await Actions.name.setManager(ens, { name: "alice.eth", manager: "0xB0b0000000000000000000000000000000000000" })
 * ```
 *
 * **Example** (Setting a manager in an Effect program)
 *
 * ```ts
 * import { Actions } from "@ensforge/sdk/effect"
 *
 * yield* Actions.name.setManager(ens, { name: "alice.eth", manager: "0xB0b0000000000000000000000000000000000000" })
 * ```
 *
 * @throws `Errors.InvalidInputError` (`INVALID_NAME`, `INVALID_ADDRESS`) for invalid input.
 * @throws `Errors.NameStateError` (`NAME_EXPIRED`, `NAME_RESERVED`, `NAME_NOT_REGISTERED`, `NAME_EXTERNAL`) when the name is not registered, or its parent's namespace manages it outside ENS's registries.
 * @throws `Errors.NameStateError` (`NAME_UNREACHABLE`) when ENSv2 resolution no longer reaches the name.
 * @throws `Errors.UnsupportedError` (`UNSUPPORTED_PROTOCOL`) for wrapped and ENSv2 names.
 * @throws `Errors.UnauthorizedError` (`NOT_OWNER`) when the account is neither registrant nor manager.
 * @throws `Errors.UserRejectedError` (`USER_REJECTED`) when the user rejects the request.
 * @throws `Errors.WalletError` (`CHAIN_MISMATCH`, `ACCOUNT_NOT_FOUND`) when the wallet is on another chain or has no account to sign with.
 * @throws `Errors.UnsupportedError` (`WALLET_BATCH_UNSUPPORTED`) with `mode: "batch"` or a paymaster when the wallet cannot send calls as one batch.
 *
 * @see {@link Actions.name.get} to read the name's current state
 * @stability stable
 * @category writing
 * @since 1.0.0
 */
export function setManager(
  client: Like,
  options: setManager.Options & Write.Options,
): Promise<setManager.ReturnType> {
  return Action.promise("name.setManager", Impl.setManager, client, options);
}

export declare namespace setManager {
  /** Options for {@link setManager}. */
  type Options = {
    /** ENS name. Normalized automatically. */
    name: string;
    /** New manager address. */
    manager: string;
  };
  /** Submitted transaction hashes and the plan that produced them. */
  type ReturnType = Write.Result;
  /** Errors {@link setManager} can fail with. */
  type ErrorType =
    | Errors.WriteError
    | Errors.InvalidInputError
    | Errors.NameStateError
    | Errors.UnauthorizedError;
}

// Explicit types keep these declarations free of Effect types.

/** Builds the plan without sending anything. */
setManager.prepare = Action.promiseOf(
  "name.setManager.prepare",
  Impl.setManagerMethods.prepare,
) as Write.Method<setManager.Options, Plan>;

/** Simulates the plan with `eth_call`, reporting each step. */
setManager.simulate = Action.promiseOf(
  "name.setManager.simulate",
  Impl.setManagerMethods.simulate,
) as Write.Method<setManager.Options, Plan.Simulation>;

/** Estimates the gas and ETH the plan needs. */
setManager.estimateGas = Action.promiseOf(
  "name.setManager.estimateGas",
  Impl.setManagerMethods.estimateGas,
) as Write.Method<setManager.Options, Plan.Estimate>;

/**
 * Sets the ENSv1 manager (registry owner) of a name. Resolves once the receipt is in.
 *
 * **When to use**
 *
 * Use when the next step depends on the change being on-chain.
 *
 * **Example** (Setting a manager and waiting)
 *
 * ```ts
 * const { receipt } = await ens.name.setManagerSync({ name: "alice.eth", manager: "0xB0b0000000000000000000000000000000000000" })
 * ```
 *
 * **Example** (Waiting with a standalone call)
 *
 * ```ts
 * import { Actions } from "@ensforge/sdk"
 *
 * await Actions.name.setManagerSync(ens, { name: "alice.eth", manager: "0xB0b0000000000000000000000000000000000000" })
 * ```
 *
 * **Example** (Waiting in an Effect program)
 *
 * ```ts
 * import { Actions } from "@ensforge/sdk/effect"
 *
 * yield* Actions.name.setManagerSync(ens, { name: "alice.eth", manager: "0xB0b0000000000000000000000000000000000000" })
 * ```
 *
 * @throws `Errors.InvalidInputError` (`INVALID_NAME`, `INVALID_ADDRESS`) for invalid input.
 * @throws `Errors.NameStateError` (`NAME_EXPIRED`, `NAME_RESERVED`, `NAME_NOT_REGISTERED`, `NAME_EXTERNAL`) when the name is not registered, or its parent's namespace manages it outside ENS's registries.
 * @throws `Errors.NameStateError` (`NAME_UNREACHABLE`) when ENSv2 resolution no longer reaches the name.
 * @throws `Errors.UnsupportedError` (`UNSUPPORTED_PROTOCOL`) for wrapped and ENSv2 names.
 * @throws `Errors.UnauthorizedError` (`NOT_OWNER`) when the account is neither registrant nor manager.
 * @throws `Errors.TransactionError` (`TRANSACTION_REVERTED`, `RECEIPT_TIMEOUT`, `NONCE_CONFLICT`) when confirmation fails or the wallet's nonce is already used.
 *
 * @see {@link setManager} to resolve on submission
 * @stability stable
 * @category writing
 * @since 1.0.0
 */
export function setManagerSync(
  client: Like,
  options: setManagerSync.Options,
): Promise<setManagerSync.ReturnType> {
  return Action.promise("name.setManagerSync", Impl.setManagerSync, client, options);
}

export declare namespace setManagerSync {
  /** Options for {@link setManagerSync}. */
  type Options = setManager.Options & Write.SyncOptions;
  /** Receipts plus the submitted hashes and plan. */
  type ReturnType = Write.SyncResult;
  /** Errors {@link setManagerSync} can fail with. */
  type ErrorType =
    | Errors.WriteError
    | Errors.InvalidInputError
    | Errors.NameStateError
    | Errors.UnauthorizedError;
}

/** Path of the action, e.g. for cache keys. */
setManager.path = "name.setManager" as const;

/** Path of the action, e.g. for cache keys. */
setManagerSync.path = "name.setManagerSync" as const;
