import type { Errors, Plan, Write } from "@ensforge/core";
import { Action, type Like } from "@ensforge/core/extension";

import type { HcaError } from "../../../errors/classes/HcaError.js";
import * as Impl from "./effect.js";

/**
 * Approves or revokes an implementation for new HCA deployments (factory owner only). Resolves once the transaction is submitted.
 *
 * **When to use**
 *
 * Use when the DAO adds or retires an HCA implementation for new accounts.
 *
 * **Example** (Approving an implementation)
 *
 * ```ts
 * const { hash } = await ens.hcaAdmin.setDeploymentApproval({ implementation, approved: true })
 * ```
 *
 * **Example** (Approving an implementation with a standalone call)
 *
 * ```ts
 * import { Actions } from "@ensforge/hca"
 *
 * await Actions.hcaAdmin.setDeploymentApproval(ens, { implementation, approved: true })
 * ```
 *
 * **Example** (Approving an implementation in an Effect program)
 *
 * ```ts
 * import { Actions } from "@ensforge/hca/effect"
 *
 * yield* Actions.hcaAdmin.setDeploymentApproval(ens, { implementation, approved: true })
 * ```
 *
 * @throws `Errors.InvalidInputError` (`INVALID_ADDRESS`) for an invalid address.
 * @throws `Errors.HcaError` (`HCA_UNAVAILABLE`) on chains without an HCA deployment.
 *
 * @stability experimental
 * @category hca-admin
 * @since 1.0.0
 */
export function setDeploymentApproval(
  client: Like,
  options: setDeploymentApproval.Options & Write.Options,
): Promise<setDeploymentApproval.ReturnType> {
  return Action.promise(
    "hcaAdmin.setDeploymentApproval",
    Impl.setDeploymentApproval,
    client,
    options,
  );
}

export declare namespace setDeploymentApproval {
  /** Options for {@link setDeploymentApproval}. */
  type Options = {
    /** HCA implementation. */
    implementation: string;
    /** `true` to approve, `false` to revoke. */
    approved: boolean;
  };
  /** Submitted transaction hashes and the plan that produced them. */
  type ReturnType = Write.Result;
  /** Errors {@link setDeploymentApproval} can fail with. */
  type ErrorType = Errors.AnyError | HcaError;
}

// Explicit types keep these declarations free of Effect types.

/** Builds the plan without sending anything. */
setDeploymentApproval.prepare = Action.promiseOf(
  "hcaAdmin.setDeploymentApproval.prepare",
  Impl.setDeploymentApprovalMethods.prepare,
) as Write.Method<setDeploymentApproval.Options, Plan>;

/** Simulates the plan with `eth_call`, reporting each step. */
setDeploymentApproval.simulate = Action.promiseOf(
  "hcaAdmin.setDeploymentApproval.simulate",
  Impl.setDeploymentApprovalMethods.simulate,
) as Write.Method<setDeploymentApproval.Options, Plan.Simulation>;

/** Estimates the gas and ETH the plan needs. */
setDeploymentApproval.estimateGas = Action.promiseOf(
  "hcaAdmin.setDeploymentApproval.estimateGas",
  Impl.setDeploymentApprovalMethods.estimateGas,
) as Write.Method<setDeploymentApproval.Options, Plan.Estimate>;

/**
 * Approves or revokes an implementation for new HCA deployments (factory owner only). Resolves once the receipt is in.
 *
 * **When to use**
 *
 * Use when the next step depends on the change being on-chain.
 *
 * **Example** (Approving an implementation and waiting)
 *
 * ```ts
 * const { receipt } = await ens.hcaAdmin.setDeploymentApprovalSync({ implementation, approved: true })
 * ```
 *
 * **Example** (Approving an implementation with a standalone call and waiting)
 *
 * ```ts
 * import { Actions } from "@ensforge/hca"
 *
 * await Actions.hcaAdmin.setDeploymentApprovalSync(ens, { implementation, approved: true })
 * ```
 *
 * **Example** (Approving an implementation in an Effect program and waiting)
 *
 * ```ts
 * import { Actions } from "@ensforge/hca/effect"
 *
 * yield* Actions.hcaAdmin.setDeploymentApprovalSync(ens, { implementation, approved: true })
 * ```
 *
 * @throws `Errors.InvalidInputError` (`INVALID_ADDRESS`) for an invalid address.
 * @throws `Errors.HcaError` (`HCA_UNAVAILABLE`) on chains without an HCA deployment.
 * @throws `Errors.TransactionError` (`TRANSACTION_REVERTED`, `RECEIPT_TIMEOUT`) when confirmation fails.
 *
 * @see {@link setDeploymentApproval} to resolve on submission
 * @stability experimental
 * @category hca-admin
 * @since 1.0.0
 */
export function setDeploymentApprovalSync(
  client: Like,
  options: setDeploymentApprovalSync.Options,
): Promise<setDeploymentApprovalSync.ReturnType> {
  return Action.promise(
    "hcaAdmin.setDeploymentApprovalSync",
    Impl.setDeploymentApprovalSync,
    client,
    options,
  );
}

export declare namespace setDeploymentApprovalSync {
  /** Options for {@link setDeploymentApprovalSync}. */
  type Options = setDeploymentApproval.Options & Write.SyncOptions;
  /** Receipts plus the submitted hashes and plan. */
  type ReturnType = Write.SyncResult;
  /** Errors {@link setDeploymentApprovalSync} can fail with. */
  type ErrorType = Errors.AnyError | HcaError;
}
