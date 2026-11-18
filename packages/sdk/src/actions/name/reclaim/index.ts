import type { Like } from "../../../client/types.js";
import type * as Errors from "../../../errors/index.js";
import * as Action from "../../../internal/action/index.js";
import type { Plan } from "../../../plan/Plan.js";
import type { Write } from "../../../Types.js";
import * as Impl from "./effect.js";

/**
 * Resets the ENSv1 registry owner (manager) of an unwrapped `.eth` name, as its registrant. Resolves once the transaction is submitted.
 *
 * **When to use**
 *
 * Use to take over the manager after receiving a `.eth` registrar token, or to repair a lost manager. Use {@link reclaimSync} to wait for the receipt.
 *
 * **Details**
 *
 * - Only the registrar token holder (registrant) can reclaim.
 * - `owner` defaults to the signing account.
 *
 * **Example** (Reclaiming a name)
 *
 * ```ts
 * const { hash } = await ens.name.reclaim({ name: "alice.eth" })
 * ```
 *
 * **Example** (Reclaiming a name with a standalone call)
 *
 * ```ts
 * import { Actions } from "@ensforge/sdk"
 *
 * await Actions.name.reclaim(ens, { name: "alice.eth" })
 * ```
 *
 * **Example** (Reclaiming a name in an Effect program)
 *
 * ```ts
 * import { Actions } from "@ensforge/sdk/effect"
 *
 * yield* Actions.name.reclaim(ens, { name: "alice.eth" })
 * ```
 *
 * @throws `Errors.InvalidInputError` (`INVALID_NAME`, `INVALID_ADDRESS`) for invalid input.
 * @throws `Errors.NameStateError` (`NAME_EXPIRED`, `NAME_RESERVED`, `NAME_NOT_REGISTERED`) when the name is not registered.
 * @throws `Errors.UnsupportedError` (`UNSUPPORTED_PROTOCOL`) for wrapped, ENSv2 and non-`.eth` names.
 * @throws `Errors.UnauthorizedError` (`NOT_OWNER`) when the account is not the registrant.
 * @throws `Errors.UserRejectedError` when the user rejects the request.
 *
 * @see {@link Actions.name.get} to read the name's current state
 * @stability stable
 * @category writing
 * @since 1.0.0
 */
export function reclaim(
  client: Like,
  options: reclaim.Options & Write.Options,
): Promise<reclaim.ReturnType> {
  return Action.promise("name.reclaim", Impl.reclaim, client, options);
}

export declare namespace reclaim {
  /** Options for {@link reclaim}. */
  type Options = {
    /** ENS name. Normalized automatically. */
    name: string;
    /**
     * New registry owner.
     *
     * @default the signing account
     */
    owner?: string | undefined;
  };
  /** Submitted transaction hashes and the plan that produced them. */
  type ReturnType = Write.Result;
  /** Errors {@link reclaim} can fail with. */
  type ErrorType =
    | Errors.WriteError
    | Errors.InvalidInputError
    | Errors.NameStateError
    | Errors.UnauthorizedError;
}

// Explicit types keep these declarations free of Effect types.

/** Builds the plan without sending anything. */
reclaim.prepare = Action.promiseOf(
  "name.reclaim.prepare",
  Impl.reclaimMethods.prepare,
) as Write.Method<reclaim.Options, Plan>;

/** Simulates the plan with `eth_call`, reporting each step. */
reclaim.simulate = Action.promiseOf(
  "name.reclaim.simulate",
  Impl.reclaimMethods.simulate,
) as Write.Method<reclaim.Options, Plan.Simulation>;

/** Estimates the gas and ETH the plan needs. */
reclaim.estimateGas = Action.promiseOf(
  "name.reclaim.estimateGas",
  Impl.reclaimMethods.estimateGas,
) as Write.Method<reclaim.Options, Plan.Estimate>;

/**
 * Resets the ENSv1 registry owner (manager) of an unwrapped `.eth` name, as its registrant. Resolves once the receipt is in.
 *
 * **When to use**
 *
 * Use when the next step depends on the change being on-chain.
 *
 * **Example** (Reclaiming a name and waiting)
 *
 * ```ts
 * const { receipt } = await ens.name.reclaimSync({ name: "alice.eth" })
 * ```
 *
 * **Example** (Waiting with a standalone call)
 *
 * ```ts
 * import { Actions } from "@ensforge/sdk"
 *
 * await Actions.name.reclaimSync(ens, { name: "alice.eth" })
 * ```
 *
 * **Example** (Waiting in an Effect program)
 *
 * ```ts
 * import { Actions } from "@ensforge/sdk/effect"
 *
 * yield* Actions.name.reclaimSync(ens, { name: "alice.eth" })
 * ```
 *
 * @throws `Errors.InvalidInputError` (`INVALID_NAME`, `INVALID_ADDRESS`) for invalid input.
 * @throws `Errors.NameStateError` (`NAME_EXPIRED`, `NAME_RESERVED`, `NAME_NOT_REGISTERED`) when the name is not registered.
 * @throws `Errors.UnsupportedError` (`UNSUPPORTED_PROTOCOL`) for wrapped, ENSv2 and non-`.eth` names.
 * @throws `Errors.UnauthorizedError` (`NOT_OWNER`) when the account is not the registrant.
 * @throws `Errors.TransactionError` (`TRANSACTION_REVERTED`, `RECEIPT_TIMEOUT`) when confirmation fails.
 *
 * @see {@link reclaim} to resolve on submission
 * @stability stable
 * @category writing
 * @since 1.0.0
 */
export function reclaimSync(
  client: Like,
  options: reclaimSync.Options,
): Promise<reclaimSync.ReturnType> {
  return Action.promise("name.reclaimSync", Impl.reclaimSync, client, options);
}

export declare namespace reclaimSync {
  /** Options for {@link reclaimSync}. */
  type Options = reclaim.Options & Write.SyncOptions;
  /** Receipts plus the submitted hashes and plan. */
  type ReturnType = Write.SyncResult;
  /** Errors {@link reclaimSync} can fail with. */
  type ErrorType =
    | Errors.WriteError
    | Errors.InvalidInputError
    | Errors.NameStateError
    | Errors.UnauthorizedError;
}

/** Path of the action, e.g. for cache keys. */
reclaim.path = "name.reclaim" as const;

/** Path of the action, e.g. for cache keys. */
reclaimSync.path = "name.reclaimSync" as const;
