import type { Errors, Plan, Write } from "@ensforge/sdk";
import { Action, type Like } from "@ensforge/sdk/extension";

import type { HcaError } from "../../../errors/classes/HcaError.js";
import * as Impl from "./effect.js";

/**
 * Adds ETH to an HCA's ERC-4337 EntryPoint deposit. Resolves once the transaction is submitted.
 *
 * **When to use**
 *
 * Use when `bundler()` executions are paid by the HCA itself rather than a paymaster.
 *
 * **Example** (Funding the deposit)
 *
 * ```ts
 * import { parseEther } from "viem"
 *
 * const { hash } = await ens.hca.addDeposit({ amount: parseEther("0.01") })
 * ```
 *
 * **Example** (Funding the deposit with a standalone call)
 *
 * ```ts
 * import { parseEther } from "viem"
 * import { Actions } from "@ensforge/hca"
 *
 * await Actions.hca.addDeposit(ens, { amount: parseEther("0.01") })
 * ```
 *
 * **Example** (Funding the deposit in an Effect program)
 *
 * ```ts
 * import { parseEther } from "viem"
 * import { Actions } from "@ensforge/hca/effect"
 *
 * yield* Actions.hca.addDeposit(ens, { amount: parseEther("0.01") })
 * ```
 *
 * @throws `Errors.InvalidInputError` (`INVALID_ADDRESS`) for an invalid address.
 * @throws `Errors.HcaError` (`HCA_UNAVAILABLE`) on chains without an HCA deployment.
 *
 * @stability experimental
 * @category hca
 * @since 1.0.0
 */
export function addDeposit(
  client: Like,
  options: addDeposit.Options & Write.Options,
): Promise<addDeposit.ReturnType> {
  return Action.promise("hca.addDeposit", Impl.addDeposit, client, options);
}

export declare namespace addDeposit {
  /** Options for {@link addDeposit}. */
  type Options = {
    /** Wei to deposit. */
    amount: bigint;
    /** The HCA's address. @default the signer's HCA */
    address?: string | undefined;
  };
  /** Submitted transaction hashes and the plan that produced them. */
  type ReturnType = Write.Result;
  /** Errors {@link addDeposit} can fail with. */
  type ErrorType = Errors.AnyError | HcaError;
}

// Explicit types keep these declarations free of Effect types.

/** Builds the plan without sending anything. */
addDeposit.prepare = Action.promiseOf(
  "hca.addDeposit.prepare",
  Impl.addDepositMethods.prepare,
) as Write.Method<addDeposit.Options, Plan>;

/** Simulates the plan with `eth_call`, reporting each step. */
addDeposit.simulate = Action.promiseOf(
  "hca.addDeposit.simulate",
  Impl.addDepositMethods.simulate,
) as Write.Method<addDeposit.Options, Plan.Simulation>;

/** Estimates the gas and ETH the plan needs. */
addDeposit.estimateGas = Action.promiseOf(
  "hca.addDeposit.estimateGas",
  Impl.addDepositMethods.estimateGas,
) as Write.Method<addDeposit.Options, Plan.Estimate>;

/**
 * Adds ETH to an HCA's ERC-4337 EntryPoint deposit. Resolves once the receipt is in.
 *
 * **When to use**
 *
 * Use when the next step depends on the change being on-chain.
 *
 * **Example** (Funding the deposit and waiting)
 *
 * ```ts
 * import { parseEther } from "viem"
 *
 * const { receipt } = await ens.hca.addDepositSync({ amount: parseEther("0.01") })
 * ```
 *
 * **Example** (Funding the deposit with a standalone call and waiting)
 *
 * ```ts
 * import { parseEther } from "viem"
 * import { Actions } from "@ensforge/hca"
 *
 * await Actions.hca.addDepositSync(ens, { amount: parseEther("0.01") })
 * ```
 *
 * **Example** (Funding the deposit in an Effect program and waiting)
 *
 * ```ts
 * import { parseEther } from "viem"
 * import { Actions } from "@ensforge/hca/effect"
 *
 * yield* Actions.hca.addDepositSync(ens, { amount: parseEther("0.01") })
 * ```
 *
 * @throws `Errors.InvalidInputError` (`INVALID_ADDRESS`) for an invalid address.
 * @throws `Errors.HcaError` (`HCA_UNAVAILABLE`) on chains without an HCA deployment.
 * @throws `Errors.TransactionError` (`TRANSACTION_REVERTED`, `RECEIPT_TIMEOUT`) when confirmation fails.
 *
 * @see {@link addDeposit} to resolve on submission
 * @stability experimental
 * @category hca
 * @since 1.0.0
 */
export function addDepositSync(
  client: Like,
  options: addDepositSync.Options,
): Promise<addDepositSync.ReturnType> {
  return Action.promise("hca.addDepositSync", Impl.addDepositSync, client, options);
}

export declare namespace addDepositSync {
  /** Options for {@link addDepositSync}. */
  type Options = addDeposit.Options & Write.SyncOptions;
  /** Receipts plus the submitted hashes and plan. */
  type ReturnType = Write.SyncResult;
  /** Errors {@link addDepositSync} can fail with. */
  type ErrorType = Errors.AnyError | HcaError;
}

/** Path of the action, e.g. for cache keys. */
addDeposit.path = "hca.addDeposit" as const;

/** Path of the action, e.g. for cache keys. */
addDepositSync.path = "hca.addDepositSync" as const;
