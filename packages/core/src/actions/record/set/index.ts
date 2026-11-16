import type { Like } from "../../../client/types.js";
import type { AnyError } from "../../../errors/types.js";
import * as Action from "../../../internal/action/index.js";
import type { Write } from "../../../Types.js";
import * as Impl from "./effect.js";

/**
 * Writes text records of an ENS name and resolves once the transaction is submitted.
 *
 * **When to use**
 *
 * Use to update profile fields when the UI tracks confirmation itself. Use {@link setSync} to
 * wait for the receipt instead.
 *
 * **Details**
 *
 * - `null` deletes a record.
 * - Several keys become one `multicall` on the name's resolver.
 * - The call is simulated before the wallet prompt, so permission errors surface first.
 *
 * **Gotchas**
 *
 * - The name needs its own resolver; a wildcard resolver inherited from a parent is not written to.
 *
 * **Example** (Updating a profile URL)
 *
 * ```ts
 * const { hash } = await ens.record.set({ name: "alice.eth", texts: { url: "https://alice.dev" } })
 * ```
 *
 * **Example** (Deleting a record with a standalone call)
 *
 * ```ts
 * import { Actions } from "@ensforge/core"
 *
 * await Actions.record.set(ens, { name: "alice.eth", texts: { url: null } })
 * ```
 *
 * **Example** (Writing in an Effect program)
 *
 * ```ts
 * import { Actions } from "@ensforge/core/effect"
 *
 * const { hash } = yield* Actions.record.set(ens, { name: "alice.eth", texts: { url: "https://alice.dev" } })
 * ```
 *
 * @throws `Errors.InvalidInputError` (`INVALID_NAME`, `INVALID_RECORD_VALUE`) for invalid input.
 * @throws `Errors.NotFoundError` (`RESOLVER_NOT_FOUND`) when the name has no resolver of its own.
 * @throws `Errors.UnauthorizedError` (`NOT_OWNER`, `MISSING_ROLES`) when the account may not edit records.
 * @throws `Errors.ConfigError` (`WALLET_NOT_CONFIGURED`) when the client has no wallet.
 * @throws `Errors.UserRejectedError` when the user rejects the request.
 *
 * @see {@link Actions.record.getText} to read records
 * @stability stable
 * @category writing
 * @since 1.0.0
 */
export function set(client: Like, options: set.Options & Write.Options): Promise<set.ReturnType> {
  return Action.promise("record.set", Impl.set, client, options);
}

export declare namespace set {
  /** Options for {@link set}. */
  type Options = {
    /** ENS name to update. Normalized automatically. */
    name: string;
    /** Text records to write by key. `null` deletes the record. */
    texts: Readonly<Record<string, string | null>>;
  };
  /** Submitted transaction hashes and the plan that produced them. */
  type ReturnType = Write.Result;
  /** Errors {@link set} can fail with. */
  type ErrorType = AnyError;
}

/** Builds the plan without sending anything. */
set.prepare = Action.promiseOf("record.set.prepare", Impl.setMethods.prepare);

/** Simulates the plan with `eth_call`, reporting each step. */
set.simulate = Action.promiseOf("record.set.simulate", Impl.setMethods.simulate);

/** Estimates the gas and ETH the plan needs. */
set.estimateGas = Action.promiseOf("record.set.estimateGas", Impl.setMethods.estimateGas);

/**
 * Writes text records of an ENS name and resolves once the receipt is in.
 *
 * **When to use**
 *
 * Use when the next step depends on the records being confirmed on-chain.
 *
 * **Example** (Updating a profile URL and waiting)
 *
 * ```ts
 * const { receipt } = await ens.record.setSync({ name: "alice.eth", texts: { url: "https://alice.dev" } })
 * ```
 *
 * **Example** (Waiting with a standalone call)
 *
 * ```ts
 * import { Actions } from "@ensforge/core"
 *
 * await Actions.record.setSync(ens, { name: "alice.eth", texts: { url: "https://alice.dev" } })
 * ```
 *
 * **Example** (Waiting in an Effect program)
 *
 * ```ts
 * import { Actions } from "@ensforge/core/effect"
 *
 * yield* Actions.record.setSync(ens, { name: "alice.eth", texts: { url: "https://alice.dev" } })
 * ```
 *
 * @throws `Errors.InvalidInputError` (`INVALID_NAME`, `INVALID_RECORD_VALUE`) for invalid input.
 * @throws `Errors.NotFoundError` (`RESOLVER_NOT_FOUND`) when the name has no resolver of its own.
 * @throws `Errors.UnauthorizedError` (`NOT_OWNER`, `MISSING_ROLES`) when the account may not edit records.
 * @throws `Errors.TransactionError` (`TRANSACTION_REVERTED`, `RECEIPT_TIMEOUT`) when confirmation fails.
 *
 * @see {@link set} to resolve on submission
 * @stability stable
 * @category writing
 * @since 1.0.0
 */
export function setSync(client: Like, options: setSync.Options): Promise<setSync.ReturnType> {
  return Action.promise("record.setSync", Impl.setSync, client, options);
}

export declare namespace setSync {
  /** Options for {@link setSync}. */
  type Options = set.Options & Write.SyncOptions;
  /** Receipts plus the submitted hashes and plan. */
  type ReturnType = Write.SyncResult;
  /** Errors {@link setSync} can fail with. */
  type ErrorType = AnyError;
}
