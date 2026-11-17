import type { Errors, Plan, Write } from "@ensforge/sdk";
import { Action, type Like } from "@ensforge/sdk/extension";

import type { HcaError } from "../../../errors/classes/HcaError.js";
import * as Impl from "./effect.js";

/**
 * Withdraws ETH from the signer's HCA EntryPoint deposit. Resolves once the transaction is submitted.
 *
 * **When to use**
 *
 * Use to recover a deposit the HCA no longer needs.
 *
 * **Example** (Withdrawing the deposit)
 *
 * ```ts
 * const { hash } = await ens.hca.withdrawDeposit({ to: account, amount })
 * ```
 *
 * **Example** (Withdrawing the deposit with a standalone call)
 *
 * ```ts
 * import { Actions } from "@ensforge/hca"
 *
 * await Actions.hca.withdrawDeposit(ens, { to: account, amount })
 * ```
 *
 * **Example** (Withdrawing the deposit in an Effect program)
 *
 * ```ts
 * import { Actions } from "@ensforge/hca/effect"
 *
 * yield* Actions.hca.withdrawDeposit(ens, { to: account, amount })
 * ```
 *
 * @throws `Errors.InvalidInputError` (`INVALID_ADDRESS`) for an invalid recipient.
 * @throws `Errors.HcaError` (`HCA_UNAVAILABLE`) on chains without an HCA deployment.
 *
 * @stability experimental
 * @category hca
 * @since 1.0.0
 */
export function withdrawDeposit(
  client: Like,
  options: withdrawDeposit.Options & Write.Options,
): Promise<withdrawDeposit.ReturnType> {
  return Action.promise("hca.withdrawDeposit", Impl.withdrawDeposit, client, options);
}

export declare namespace withdrawDeposit {
  /** Options for {@link withdrawDeposit}. */
  type Options = {
    /** Recipient. */
    to: string;
    /** Wei to withdraw. */
    amount: bigint;
  };
  /** Submitted transaction hashes and the plan that produced them. */
  type ReturnType = Write.Result;
  /** Errors {@link withdrawDeposit} can fail with. */
  type ErrorType = Errors.AnyError | HcaError;
}

// Explicit types keep these declarations free of Effect types.

/** Builds the plan without sending anything. */
withdrawDeposit.prepare = Action.promiseOf(
  "hca.withdrawDeposit.prepare",
  Impl.withdrawDepositMethods.prepare,
) as Write.Method<withdrawDeposit.Options, Plan>;

/** Simulates the plan with `eth_call`, reporting each step. */
withdrawDeposit.simulate = Action.promiseOf(
  "hca.withdrawDeposit.simulate",
  Impl.withdrawDepositMethods.simulate,
) as Write.Method<withdrawDeposit.Options, Plan.Simulation>;

/** Estimates the gas and ETH the plan needs. */
withdrawDeposit.estimateGas = Action.promiseOf(
  "hca.withdrawDeposit.estimateGas",
  Impl.withdrawDepositMethods.estimateGas,
) as Write.Method<withdrawDeposit.Options, Plan.Estimate>;

/**
 * Withdraws ETH from the signer's HCA EntryPoint deposit. Resolves once the receipt is in.
 *
 * **When to use**
 *
 * Use when the next step depends on the change being on-chain.
 *
 * **Example** (Withdrawing the deposit and waiting)
 *
 * ```ts
 * const { receipt } = await ens.hca.withdrawDepositSync({ to: account, amount })
 * ```
 *
 * **Example** (Withdrawing the deposit with a standalone call and waiting)
 *
 * ```ts
 * import { Actions } from "@ensforge/hca"
 *
 * await Actions.hca.withdrawDepositSync(ens, { to: account, amount })
 * ```
 *
 * **Example** (Withdrawing the deposit in an Effect program and waiting)
 *
 * ```ts
 * import { Actions } from "@ensforge/hca/effect"
 *
 * yield* Actions.hca.withdrawDepositSync(ens, { to: account, amount })
 * ```
 *
 * @throws `Errors.InvalidInputError` (`INVALID_ADDRESS`) for an invalid recipient.
 * @throws `Errors.HcaError` (`HCA_UNAVAILABLE`) on chains without an HCA deployment.
 * @throws `Errors.TransactionError` (`TRANSACTION_REVERTED`, `RECEIPT_TIMEOUT`) when confirmation fails.
 *
 * @see {@link withdrawDeposit} to resolve on submission
 * @stability experimental
 * @category hca
 * @since 1.0.0
 */
export function withdrawDepositSync(
  client: Like,
  options: withdrawDepositSync.Options,
): Promise<withdrawDepositSync.ReturnType> {
  return Action.promise("hca.withdrawDepositSync", Impl.withdrawDepositSync, client, options);
}

export declare namespace withdrawDepositSync {
  /** Options for {@link withdrawDepositSync}. */
  type Options = withdrawDeposit.Options & Write.SyncOptions;
  /** Receipts plus the submitted hashes and plan. */
  type ReturnType = Write.SyncResult;
  /** Errors {@link withdrawDepositSync} can fail with. */
  type ErrorType = Errors.AnyError | HcaError;
}
