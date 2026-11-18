import type { Errors, Plan, Write } from "@ensforge/sdk";
import { Action, type Like } from "@ensforge/sdk/extension";
import type { Address, Hex } from "viem";

import type { HcaError } from "../../../errors/classes/HcaError.js";
import * as Impl from "./effect.js";

/**
 * Runs calls from the signer's HCA as one atomic execution. Resolves once the transaction is submitted.
 *
 * **When to use**
 *
 * Use to batch arbitrary calls the HCA has authority for, or to recover funds the HCA holds.
 *
 * **Details**
 *
 * - Runs through `via` (default `hca()`: the owner's wallet sends `executeByOwner`).
 * - Every call succeeds or the whole execution reverts.
 *
 * **Example** (Running calls from the HCA)
 *
 * ```ts
 * const { hash } = await ens.hca.execute({ calls })
 * ```
 *
 * **Example** (Running calls from the HCA with a standalone call)
 *
 * ```ts
 * import { Actions } from "@ensforge/hca"
 *
 * await Actions.hca.execute(ens, { calls })
 * ```
 *
 * **Example** (Running calls from the HCA in an Effect program)
 *
 * ```ts
 * import { Actions } from "@ensforge/hca/effect"
 *
 * yield* Actions.hca.execute(ens, { calls })
 * ```
 *
 * @throws `Errors.HcaError` (`HCA_NOT_VERIFIED`, `HCA_EXECUTOR_UNSUPPORTED`) when the HCA or executor cannot run them.
 * @throws `Errors.HcaError` (`HCA_UNAVAILABLE`) on chains without an HCA deployment.
 *
 * @stability experimental
 * @category hca
 * @since 1.0.0
 */
export function execute(
  client: Like,
  options: execute.Options & Write.Options,
): Promise<execute.ReturnType> {
  return Action.promise("hca.execute", Impl.execute, client, options);
}

export declare namespace execute {
  /** Options for {@link execute}. */
  type Options = {
    /** Calls to run, in order; `value` is paid from what the execution forwards. */
    calls: readonly {
      readonly to: Address;
      readonly data?: Hex | undefined;
      readonly value?: bigint | undefined;
    }[];
  };
  /** Submitted transaction hashes and the plan that produced them. */
  type ReturnType = Write.Result;
  /** Errors {@link execute} can fail with. */
  type ErrorType = Errors.WriteError | HcaError;
}

// Explicit types keep these declarations free of Effect types.

/** Builds the plan without sending anything. */
execute.prepare = Action.promiseOf(
  "hca.execute.prepare",
  Impl.executeMethods.prepare,
) as Write.Method<execute.Options, Plan>;

/** Simulates the plan with `eth_call`, reporting each step. */
execute.simulate = Action.promiseOf(
  "hca.execute.simulate",
  Impl.executeMethods.simulate,
) as Write.Method<execute.Options, Plan.Simulation>;

/** Estimates the gas and ETH the plan needs. */
execute.estimateGas = Action.promiseOf(
  "hca.execute.estimateGas",
  Impl.executeMethods.estimateGas,
) as Write.Method<execute.Options, Plan.Estimate>;

/**
 * Runs calls from the signer's HCA as one atomic execution. Resolves once the receipt is in.
 *
 * **When to use**
 *
 * Use when the next step depends on the change being on-chain.
 *
 * **Example** (Running calls from the HCA and waiting)
 *
 * ```ts
 * const { receipt } = await ens.hca.executeSync({ calls })
 * ```
 *
 * **Example** (Running calls from the HCA with a standalone call and waiting)
 *
 * ```ts
 * import { Actions } from "@ensforge/hca"
 *
 * await Actions.hca.executeSync(ens, { calls })
 * ```
 *
 * **Example** (Running calls from the HCA in an Effect program and waiting)
 *
 * ```ts
 * import { Actions } from "@ensforge/hca/effect"
 *
 * yield* Actions.hca.executeSync(ens, { calls })
 * ```
 *
 * @throws `Errors.HcaError` (`HCA_NOT_VERIFIED`, `HCA_EXECUTOR_UNSUPPORTED`) when the HCA or executor cannot run them.
 * @throws `Errors.HcaError` (`HCA_UNAVAILABLE`) on chains without an HCA deployment.
 * @throws `Errors.TransactionError` (`TRANSACTION_REVERTED`, `RECEIPT_TIMEOUT`) when confirmation fails.
 *
 * @see {@link execute} to resolve on submission
 * @stability experimental
 * @category hca
 * @since 1.0.0
 */
export function executeSync(
  client: Like,
  options: executeSync.Options,
): Promise<executeSync.ReturnType> {
  return Action.promise("hca.executeSync", Impl.executeSync, client, options);
}

export declare namespace executeSync {
  /** Options for {@link executeSync}. */
  type Options = execute.Options & Write.SyncOptions;
  /** Receipts plus the submitted hashes and plan. */
  type ReturnType = Write.SyncResult;
  /** Errors {@link executeSync} can fail with. */
  type ErrorType = Errors.WriteError | HcaError;
}

/** Path of the action, e.g. for cache keys. */
execute.path = "hca.execute" as const;

/** Path of the action, e.g. for cache keys. */
executeSync.path = "hca.executeSync" as const;
