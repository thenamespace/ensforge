import type { Errors, Plan, Write } from "@ensforge/core";
import { Action, type Like } from "@ensforge/core/extension";

import type { HcaError } from "../../../errors/classes/HcaError.js";
import * as Impl from "./effect.js";

/**
 * Deploys the signer's HCA through the ENS factory. Resolves once the transaction is submitted.
 *
 * **When to use**
 *
 * Use to deploy ahead of time; otherwise the first execution through the HCA deploys it.
 *
 * **Details**
 *
 * - Idempotent: deploying an existing HCA returns it unchanged.
 *
 * **Example** (Deploying the signer's HCA)
 *
 * ```ts
 * const { hash } = await ens.hca.deploy({})
 * ```
 *
 * **Example** (Deploying the signer's HCA with a standalone call)
 *
 * ```ts
 * import { Actions } from "@ensforge/hca"
 *
 * await Actions.hca.deploy(ens, {})
 * ```
 *
 * **Example** (Deploying the signer's HCA in an Effect program)
 *
 * ```ts
 * import { Actions } from "@ensforge/hca/effect"
 *
 * yield* Actions.hca.deploy(ens, {})
 * ```
 *
 * @throws `Errors.HcaError` (`HCA_UNAVAILABLE`) on chains without an HCA deployment.
 *
 * @stability experimental
 * @category hca
 * @since 1.0.0
 */
export function deploy(
  client: Like,
  options: deploy.Options & Write.Options,
): Promise<deploy.ReturnType> {
  return Action.promise("hca.deploy", Impl.deploy, client, options);
}

export declare namespace deploy {
  /** Options for {@link deploy}. */
  type Options = {};
  /** Submitted transaction hashes and the plan that produced them. */
  type ReturnType = Write.Result;
  /** Errors {@link deploy} can fail with. */
  type ErrorType = Errors.AnyError | HcaError;
}

// Explicit types keep these declarations free of Effect types.

/** Builds the plan without sending anything. */
deploy.prepare = Action.promiseOf("hca.deploy.prepare", Impl.deployMethods.prepare) as Write.Method<
  deploy.Options,
  Plan
>;

/** Simulates the plan with `eth_call`, reporting each step. */
deploy.simulate = Action.promiseOf(
  "hca.deploy.simulate",
  Impl.deployMethods.simulate,
) as Write.Method<deploy.Options, Plan.Simulation>;

/** Estimates the gas and ETH the plan needs. */
deploy.estimateGas = Action.promiseOf(
  "hca.deploy.estimateGas",
  Impl.deployMethods.estimateGas,
) as Write.Method<deploy.Options, Plan.Estimate>;

/**
 * Deploys the signer's HCA through the ENS factory. Resolves once the receipt is in.
 *
 * **When to use**
 *
 * Use when the next step depends on the change being on-chain.
 *
 * **Example** (Deploying the signer's HCA and waiting)
 *
 * ```ts
 * const { receipt } = await ens.hca.deploySync({})
 * ```
 *
 * **Example** (Deploying the signer's HCA with a standalone call and waiting)
 *
 * ```ts
 * import { Actions } from "@ensforge/hca"
 *
 * await Actions.hca.deploySync(ens, {})
 * ```
 *
 * **Example** (Deploying the signer's HCA in an Effect program and waiting)
 *
 * ```ts
 * import { Actions } from "@ensforge/hca/effect"
 *
 * yield* Actions.hca.deploySync(ens, {})
 * ```
 *
 * @throws `Errors.HcaError` (`HCA_UNAVAILABLE`) on chains without an HCA deployment.
 * @throws `Errors.TransactionError` (`TRANSACTION_REVERTED`, `RECEIPT_TIMEOUT`) when confirmation fails.
 *
 * @see {@link deploy} to resolve on submission
 * @stability experimental
 * @category hca
 * @since 1.0.0
 */
export function deploySync(
  client: Like,
  options: deploySync.Options,
): Promise<deploySync.ReturnType> {
  return Action.promise("hca.deploySync", Impl.deploySync, client, options);
}

export declare namespace deploySync {
  /** Options for {@link deploySync}. */
  type Options = deploy.Options & Write.SyncOptions;
  /** Receipts plus the submitted hashes and plan. */
  type ReturnType = Write.SyncResult;
  /** Errors {@link deploySync} can fail with. */
  type ErrorType = Errors.AnyError | HcaError;
}
