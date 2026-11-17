import type { Errors, Plan, Write } from "@ensforge/sdk";
import { Action, type Like } from "@ensforge/sdk/extension";

import type { HcaError } from "../../../errors/classes/HcaError.js";
import * as Impl from "./effect.js";

/**
 * Renounces ownership of the HCA factory, freezing its implementation approvals (factory owner only). Resolves once the transaction is submitted.
 *
 * **When to use**
 *
 * Use to make the set of deployable HCA implementations permanent.
 *
 * **Example** (Renouncing the factory)
 *
 * ```ts
 * const { hash } = await ens.hcaAdmin.renounceGovernance({})
 * ```
 *
 * **Example** (Renouncing the factory with a standalone call)
 *
 * ```ts
 * import { Actions } from "@ensforge/hca"
 *
 * await Actions.hcaAdmin.renounceGovernance(ens, {})
 * ```
 *
 * **Example** (Renouncing the factory in an Effect program)
 *
 * ```ts
 * import { Actions } from "@ensforge/hca/effect"
 *
 * yield* Actions.hcaAdmin.renounceGovernance(ens, {})
 * ```
 *
 * @throws `Errors.HcaError` (`HCA_UNAVAILABLE`) on chains without an HCA deployment.
 *
 * @stability experimental
 * @category hca-admin
 * @since 1.0.0
 */
export function renounceGovernance(
  client: Like,
  options: renounceGovernance.Options & Write.Options,
): Promise<renounceGovernance.ReturnType> {
  return Action.promise("hcaAdmin.renounceGovernance", Impl.renounceGovernance, client, options);
}

export declare namespace renounceGovernance {
  /** Options for {@link renounceGovernance}. */
  type Options = {};
  /** Submitted transaction hashes and the plan that produced them. */
  type ReturnType = Write.Result;
  /** Errors {@link renounceGovernance} can fail with. */
  type ErrorType = Errors.AnyError | HcaError;
}

// Explicit types keep these declarations free of Effect types.

/** Builds the plan without sending anything. */
renounceGovernance.prepare = Action.promiseOf(
  "hcaAdmin.renounceGovernance.prepare",
  Impl.renounceGovernanceMethods.prepare,
) as Write.Method<renounceGovernance.Options, Plan>;

/** Simulates the plan with `eth_call`, reporting each step. */
renounceGovernance.simulate = Action.promiseOf(
  "hcaAdmin.renounceGovernance.simulate",
  Impl.renounceGovernanceMethods.simulate,
) as Write.Method<renounceGovernance.Options, Plan.Simulation>;

/** Estimates the gas and ETH the plan needs. */
renounceGovernance.estimateGas = Action.promiseOf(
  "hcaAdmin.renounceGovernance.estimateGas",
  Impl.renounceGovernanceMethods.estimateGas,
) as Write.Method<renounceGovernance.Options, Plan.Estimate>;

/**
 * Renounces ownership of the HCA factory, freezing its implementation approvals (factory owner only). Resolves once the receipt is in.
 *
 * **When to use**
 *
 * Use when the next step depends on the change being on-chain.
 *
 * **Example** (Renouncing the factory and waiting)
 *
 * ```ts
 * const { receipt } = await ens.hcaAdmin.renounceGovernanceSync({})
 * ```
 *
 * **Example** (Renouncing the factory with a standalone call and waiting)
 *
 * ```ts
 * import { Actions } from "@ensforge/hca"
 *
 * await Actions.hcaAdmin.renounceGovernanceSync(ens, {})
 * ```
 *
 * **Example** (Renouncing the factory in an Effect program and waiting)
 *
 * ```ts
 * import { Actions } from "@ensforge/hca/effect"
 *
 * yield* Actions.hcaAdmin.renounceGovernanceSync(ens, {})
 * ```
 *
 * @throws `Errors.HcaError` (`HCA_UNAVAILABLE`) on chains without an HCA deployment.
 * @throws `Errors.TransactionError` (`TRANSACTION_REVERTED`, `RECEIPT_TIMEOUT`) when confirmation fails.
 *
 * @see {@link renounceGovernance} to resolve on submission
 * @stability experimental
 * @category hca-admin
 * @since 1.0.0
 */
export function renounceGovernanceSync(
  client: Like,
  options: renounceGovernanceSync.Options,
): Promise<renounceGovernanceSync.ReturnType> {
  return Action.promise(
    "hcaAdmin.renounceGovernanceSync",
    Impl.renounceGovernanceSync,
    client,
    options,
  );
}

export declare namespace renounceGovernanceSync {
  /** Options for {@link renounceGovernanceSync}. */
  type Options = renounceGovernance.Options & Write.SyncOptions;
  /** Receipts plus the submitted hashes and plan. */
  type ReturnType = Write.SyncResult;
  /** Errors {@link renounceGovernanceSync} can fail with. */
  type ErrorType = Errors.AnyError | HcaError;
}

/** Path of the action, e.g. for cache keys. */
renounceGovernance.path = "hcaAdmin.renounceGovernance" as const;

/** Path of the action, e.g. for cache keys. */
renounceGovernanceSync.path = "hcaAdmin.renounceGovernanceSync" as const;
