import type { Errors, Plan, Write } from "@ensforge/sdk";
import { Action, type Like } from "@ensforge/sdk/extension";

import type { HcaError } from "../../../errors/classes/HcaError.js";
import * as Impl from "./effect.js";

/**
 * Revokes root roles on the HCA upgrade set (role admins only). Resolves once the transaction is submitted.
 *
 * **When to use**
 *
 * Use to remove an account's ability to approve HCA upgrade targets.
 *
 * **Example** (Revoking upgrade-set roles)
 *
 * ```ts
 * const { hash } = await ens.hcaAdmin.revokeUpgradeSetRoles({ account, roles })
 * ```
 *
 * **Example** (Revoking upgrade-set roles with a standalone call)
 *
 * ```ts
 * import { Actions } from "@ensforge/hca"
 *
 * await Actions.hcaAdmin.revokeUpgradeSetRoles(ens, { account, roles })
 * ```
 *
 * **Example** (Revoking upgrade-set roles in an Effect program)
 *
 * ```ts
 * import { Actions } from "@ensforge/hca/effect"
 *
 * yield* Actions.hcaAdmin.revokeUpgradeSetRoles(ens, { account, roles })
 * ```
 *
 * @throws `Errors.InvalidInputError` (`INVALID_ADDRESS`) for an invalid address.
 * @throws `Errors.HcaError` (`HCA_UNAVAILABLE`) on chains without an HCA deployment.
 *
 * @stability experimental
 * @category hca-admin
 * @since 1.0.0
 */
export function revokeUpgradeSetRoles(
  client: Like,
  options: revokeUpgradeSetRoles.Options & Write.Options,
): Promise<revokeUpgradeSetRoles.ReturnType> {
  return Action.promise(
    "hcaAdmin.revokeUpgradeSetRoles",
    Impl.revokeUpgradeSetRoles,
    client,
    options,
  );
}

export declare namespace revokeUpgradeSetRoles {
  /** Options for {@link revokeUpgradeSetRoles}. */
  type Options = {
    /** Account to revoke. */
    grantee: string;
    /** Role bitmap. */
    roles: bigint;
  };
  /** Submitted transaction hashes and the plan that produced them. */
  type ReturnType = Write.Result;
  /** Errors {@link revokeUpgradeSetRoles} can fail with. */
  type ErrorType = Errors.AnyError | HcaError;
}

// Explicit types keep these declarations free of Effect types.

/** Builds the plan without sending anything. */
revokeUpgradeSetRoles.prepare = Action.promiseOf(
  "hcaAdmin.revokeUpgradeSetRoles.prepare",
  Impl.revokeUpgradeSetRolesMethods.prepare,
) as Write.Method<revokeUpgradeSetRoles.Options, Plan>;

/** Simulates the plan with `eth_call`, reporting each step. */
revokeUpgradeSetRoles.simulate = Action.promiseOf(
  "hcaAdmin.revokeUpgradeSetRoles.simulate",
  Impl.revokeUpgradeSetRolesMethods.simulate,
) as Write.Method<revokeUpgradeSetRoles.Options, Plan.Simulation>;

/** Estimates the gas and ETH the plan needs. */
revokeUpgradeSetRoles.estimateGas = Action.promiseOf(
  "hcaAdmin.revokeUpgradeSetRoles.estimateGas",
  Impl.revokeUpgradeSetRolesMethods.estimateGas,
) as Write.Method<revokeUpgradeSetRoles.Options, Plan.Estimate>;

/**
 * Revokes root roles on the HCA upgrade set (role admins only). Resolves once the receipt is in.
 *
 * **When to use**
 *
 * Use when the next step depends on the change being on-chain.
 *
 * **Example** (Revoking upgrade-set roles and waiting)
 *
 * ```ts
 * const { receipt } = await ens.hcaAdmin.revokeUpgradeSetRolesSync({ account, roles })
 * ```
 *
 * **Example** (Revoking upgrade-set roles with a standalone call and waiting)
 *
 * ```ts
 * import { Actions } from "@ensforge/hca"
 *
 * await Actions.hcaAdmin.revokeUpgradeSetRolesSync(ens, { account, roles })
 * ```
 *
 * **Example** (Revoking upgrade-set roles in an Effect program and waiting)
 *
 * ```ts
 * import { Actions } from "@ensforge/hca/effect"
 *
 * yield* Actions.hcaAdmin.revokeUpgradeSetRolesSync(ens, { account, roles })
 * ```
 *
 * @throws `Errors.InvalidInputError` (`INVALID_ADDRESS`) for an invalid address.
 * @throws `Errors.HcaError` (`HCA_UNAVAILABLE`) on chains without an HCA deployment.
 * @throws `Errors.TransactionError` (`TRANSACTION_REVERTED`, `RECEIPT_TIMEOUT`) when confirmation fails.
 *
 * @see {@link revokeUpgradeSetRoles} to resolve on submission
 * @stability experimental
 * @category hca-admin
 * @since 1.0.0
 */
export function revokeUpgradeSetRolesSync(
  client: Like,
  options: revokeUpgradeSetRolesSync.Options,
): Promise<revokeUpgradeSetRolesSync.ReturnType> {
  return Action.promise(
    "hcaAdmin.revokeUpgradeSetRolesSync",
    Impl.revokeUpgradeSetRolesSync,
    client,
    options,
  );
}

export declare namespace revokeUpgradeSetRolesSync {
  /** Options for {@link revokeUpgradeSetRolesSync}. */
  type Options = revokeUpgradeSetRoles.Options & Write.SyncOptions;
  /** Receipts plus the submitted hashes and plan. */
  type ReturnType = Write.SyncResult;
  /** Errors {@link revokeUpgradeSetRolesSync} can fail with. */
  type ErrorType = Errors.AnyError | HcaError;
}
