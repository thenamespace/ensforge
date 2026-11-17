import type { Errors, Plan, Write } from "@ensforge/sdk";
import { Action, type Like } from "@ensforge/sdk/extension";

import type { HcaError } from "../../../errors/classes/HcaError.js";
import * as Impl from "./effect.js";

/**
 * Approves or revokes an implementation in the HCA upgrade set (role holders only). Resolves once the transaction is submitted.
 *
 * **When to use**
 *
 * Use when the DAO allows existing HCAs to upgrade to an implementation, or withdraws that.
 *
 * **Example** (Allowing an upgrade target)
 *
 * ```ts
 * const { hash } = await ens.hcaAdmin.setUpgradeApproval({ implementation, approved: true })
 * ```
 *
 * **Example** (Allowing an upgrade target with a standalone call)
 *
 * ```ts
 * import { Actions } from "@ensforge/hca"
 *
 * await Actions.hcaAdmin.setUpgradeApproval(ens, { implementation, approved: true })
 * ```
 *
 * **Example** (Allowing an upgrade target in an Effect program)
 *
 * ```ts
 * import { Actions } from "@ensforge/hca/effect"
 *
 * yield* Actions.hcaAdmin.setUpgradeApproval(ens, { implementation, approved: true })
 * ```
 *
 * @throws `Errors.InvalidInputError` (`INVALID_ADDRESS`) for an invalid address.
 * @throws `Errors.HcaError` (`HCA_UNAVAILABLE`) on chains without an HCA deployment.
 *
 * @stability experimental
 * @category hca-admin
 * @since 1.0.0
 */
export function setUpgradeApproval(
  client: Like,
  options: setUpgradeApproval.Options & Write.Options,
): Promise<setUpgradeApproval.ReturnType> {
  return Action.promise("hcaAdmin.setUpgradeApproval", Impl.setUpgradeApproval, client, options);
}

export declare namespace setUpgradeApproval {
  /** Options for {@link setUpgradeApproval}. */
  type Options = {
    /** HCA implementation. */
    implementation: string;
    /** `true` to approve, `false` to revoke. */
    approved: boolean;
  };
  /** Submitted transaction hashes and the plan that produced them. */
  type ReturnType = Write.Result;
  /** Errors {@link setUpgradeApproval} can fail with. */
  type ErrorType = Errors.AnyError | HcaError;
}

// Explicit types keep these declarations free of Effect types.

/** Builds the plan without sending anything. */
setUpgradeApproval.prepare = Action.promiseOf(
  "hcaAdmin.setUpgradeApproval.prepare",
  Impl.setUpgradeApprovalMethods.prepare,
) as Write.Method<setUpgradeApproval.Options, Plan>;

/** Simulates the plan with `eth_call`, reporting each step. */
setUpgradeApproval.simulate = Action.promiseOf(
  "hcaAdmin.setUpgradeApproval.simulate",
  Impl.setUpgradeApprovalMethods.simulate,
) as Write.Method<setUpgradeApproval.Options, Plan.Simulation>;

/** Estimates the gas and ETH the plan needs. */
setUpgradeApproval.estimateGas = Action.promiseOf(
  "hcaAdmin.setUpgradeApproval.estimateGas",
  Impl.setUpgradeApprovalMethods.estimateGas,
) as Write.Method<setUpgradeApproval.Options, Plan.Estimate>;

/**
 * Approves or revokes an implementation in the HCA upgrade set (role holders only). Resolves once the receipt is in.
 *
 * **When to use**
 *
 * Use when the next step depends on the change being on-chain.
 *
 * **Example** (Allowing an upgrade target and waiting)
 *
 * ```ts
 * const { receipt } = await ens.hcaAdmin.setUpgradeApprovalSync({ implementation, approved: true })
 * ```
 *
 * **Example** (Allowing an upgrade target with a standalone call and waiting)
 *
 * ```ts
 * import { Actions } from "@ensforge/hca"
 *
 * await Actions.hcaAdmin.setUpgradeApprovalSync(ens, { implementation, approved: true })
 * ```
 *
 * **Example** (Allowing an upgrade target in an Effect program and waiting)
 *
 * ```ts
 * import { Actions } from "@ensforge/hca/effect"
 *
 * yield* Actions.hcaAdmin.setUpgradeApprovalSync(ens, { implementation, approved: true })
 * ```
 *
 * @throws `Errors.InvalidInputError` (`INVALID_ADDRESS`) for an invalid address.
 * @throws `Errors.HcaError` (`HCA_UNAVAILABLE`) on chains without an HCA deployment.
 * @throws `Errors.TransactionError` (`TRANSACTION_REVERTED`, `RECEIPT_TIMEOUT`) when confirmation fails.
 *
 * @see {@link setUpgradeApproval} to resolve on submission
 * @stability experimental
 * @category hca-admin
 * @since 1.0.0
 */
export function setUpgradeApprovalSync(
  client: Like,
  options: setUpgradeApprovalSync.Options,
): Promise<setUpgradeApprovalSync.ReturnType> {
  return Action.promise(
    "hcaAdmin.setUpgradeApprovalSync",
    Impl.setUpgradeApprovalSync,
    client,
    options,
  );
}

export declare namespace setUpgradeApprovalSync {
  /** Options for {@link setUpgradeApprovalSync}. */
  type Options = setUpgradeApproval.Options & Write.SyncOptions;
  /** Receipts plus the submitted hashes and plan. */
  type ReturnType = Write.SyncResult;
  /** Errors {@link setUpgradeApprovalSync} can fail with. */
  type ErrorType = Errors.AnyError | HcaError;
}

/** Path of the action, e.g. for cache keys. */
setUpgradeApproval.path = "hcaAdmin.setUpgradeApproval" as const;

/** Path of the action, e.g. for cache keys. */
setUpgradeApprovalSync.path = "hcaAdmin.setUpgradeApprovalSync" as const;
