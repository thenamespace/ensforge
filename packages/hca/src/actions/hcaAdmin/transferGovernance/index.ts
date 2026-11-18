import type { Errors, Plan, Write } from "@ensforge/sdk";
import { Action, type Like } from "@ensforge/sdk/extension";

import type { HcaError } from "../../../errors/classes/HcaError.js";
import * as Impl from "./effect.js";

/**
 * Transfers ownership of the HCA factory (factory owner only). Resolves once the transaction is submitted.
 *
 * **When to use**
 *
 * Use when governance of HCA deployments moves to another account, e.g. the DAO timelock.
 *
 * **Example** (Transferring the factory)
 *
 * ```ts
 * const { hash } = await ens.hcaAdmin.transferGovernance({ newOwner })
 * ```
 *
 * **Example** (Transferring the factory with a standalone call)
 *
 * ```ts
 * import { Actions } from "@ensforge/hca"
 *
 * await Actions.hcaAdmin.transferGovernance(ens, { newOwner })
 * ```
 *
 * **Example** (Transferring the factory in an Effect program)
 *
 * ```ts
 * import { Actions } from "@ensforge/hca/effect"
 *
 * yield* Actions.hcaAdmin.transferGovernance(ens, { newOwner })
 * ```
 *
 * @throws `Errors.InvalidInputError` (`INVALID_ADDRESS`) for an invalid address.
 * @throws `Errors.HcaError` (`HCA_UNAVAILABLE`) on chains without an HCA deployment.
 *
 * @stability experimental
 * @category hca-admin
 * @since 1.0.0
 */
export function transferGovernance(
  client: Like,
  options: transferGovernance.Options & Write.Options,
): Promise<transferGovernance.ReturnType> {
  return Action.promise("hcaAdmin.transferGovernance", Impl.transferGovernance, client, options);
}

export declare namespace transferGovernance {
  /** Options for {@link transferGovernance}. */
  type Options = {
    /** New factory owner. */
    newOwner: string;
  };
  /** Submitted transaction hashes and the plan that produced them. */
  type ReturnType = Write.Result;
  /** Errors {@link transferGovernance} can fail with. */
  type ErrorType = Errors.WriteError | Errors.InvalidInputError | HcaError;
}

// Explicit types keep these declarations free of Effect types.

/** Builds the plan without sending anything. */
transferGovernance.prepare = Action.promiseOf(
  "hcaAdmin.transferGovernance.prepare",
  Impl.transferGovernanceMethods.prepare,
) as Write.Method<transferGovernance.Options, Plan>;

/** Simulates the plan with `eth_call`, reporting each step. */
transferGovernance.simulate = Action.promiseOf(
  "hcaAdmin.transferGovernance.simulate",
  Impl.transferGovernanceMethods.simulate,
) as Write.Method<transferGovernance.Options, Plan.Simulation>;

/** Estimates the gas and ETH the plan needs. */
transferGovernance.estimateGas = Action.promiseOf(
  "hcaAdmin.transferGovernance.estimateGas",
  Impl.transferGovernanceMethods.estimateGas,
) as Write.Method<transferGovernance.Options, Plan.Estimate>;

/**
 * Transfers ownership of the HCA factory (factory owner only). Resolves once the receipt is in.
 *
 * **When to use**
 *
 * Use when the next step depends on the change being on-chain.
 *
 * **Example** (Transferring the factory and waiting)
 *
 * ```ts
 * const { receipt } = await ens.hcaAdmin.transferGovernanceSync({ newOwner })
 * ```
 *
 * **Example** (Transferring the factory with a standalone call and waiting)
 *
 * ```ts
 * import { Actions } from "@ensforge/hca"
 *
 * await Actions.hcaAdmin.transferGovernanceSync(ens, { newOwner })
 * ```
 *
 * **Example** (Transferring the factory in an Effect program and waiting)
 *
 * ```ts
 * import { Actions } from "@ensforge/hca/effect"
 *
 * yield* Actions.hcaAdmin.transferGovernanceSync(ens, { newOwner })
 * ```
 *
 * @throws `Errors.InvalidInputError` (`INVALID_ADDRESS`) for an invalid address.
 * @throws `Errors.HcaError` (`HCA_UNAVAILABLE`) on chains without an HCA deployment.
 * @throws `Errors.TransactionError` (`TRANSACTION_REVERTED`, `RECEIPT_TIMEOUT`) when confirmation fails.
 *
 * @see {@link transferGovernance} to resolve on submission
 * @stability experimental
 * @category hca-admin
 * @since 1.0.0
 */
export function transferGovernanceSync(
  client: Like,
  options: transferGovernanceSync.Options,
): Promise<transferGovernanceSync.ReturnType> {
  return Action.promise(
    "hcaAdmin.transferGovernanceSync",
    Impl.transferGovernanceSync,
    client,
    options,
  );
}

export declare namespace transferGovernanceSync {
  /** Options for {@link transferGovernanceSync}. */
  type Options = transferGovernance.Options & Write.SyncOptions;
  /** Receipts plus the submitted hashes and plan. */
  type ReturnType = Write.SyncResult;
  /** Errors {@link transferGovernanceSync} can fail with. */
  type ErrorType = Errors.WriteError | Errors.InvalidInputError | HcaError;
}

/** Path of the action, e.g. for cache keys. */
transferGovernance.path = "hcaAdmin.transferGovernance" as const;

/** Path of the action, e.g. for cache keys. */
transferGovernanceSync.path = "hcaAdmin.transferGovernanceSync" as const;
