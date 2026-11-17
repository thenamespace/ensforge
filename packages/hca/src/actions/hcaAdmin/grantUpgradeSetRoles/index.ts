import type { Errors, Plan, Write } from "@ensforge/sdk";
import { Action, type Like } from "@ensforge/sdk/extension";

import type { HcaError } from "../../../errors/classes/HcaError.js";
import * as Impl from "./effect.js";

/**
 * Grants root roles on the HCA upgrade set (role admins only). Resolves once the transaction is submitted.
 *
 * **When to use**
 *
 * Use to let another account approve HCA upgrade targets.
 *
 * **Example** (Granting upgrade-set roles)
 *
 * ```ts
 * const { hash } = await ens.hcaAdmin.grantUpgradeSetRoles({ account, roles })
 * ```
 *
 * **Example** (Granting upgrade-set roles with a standalone call)
 *
 * ```ts
 * import { Actions } from "@ensforge/hca"
 *
 * await Actions.hcaAdmin.grantUpgradeSetRoles(ens, { account, roles })
 * ```
 *
 * **Example** (Granting upgrade-set roles in an Effect program)
 *
 * ```ts
 * import { Actions } from "@ensforge/hca/effect"
 *
 * yield* Actions.hcaAdmin.grantUpgradeSetRoles(ens, { account, roles })
 * ```
 *
 * @throws `Errors.InvalidInputError` (`INVALID_ADDRESS`) for an invalid address.
 * @throws `Errors.HcaError` (`HCA_UNAVAILABLE`) on chains without an HCA deployment.
 *
 * @stability experimental
 * @category hca-admin
 * @since 1.0.0
 */
export function grantUpgradeSetRoles(
  client: Like,
  options: grantUpgradeSetRoles.Options & Write.Options,
): Promise<grantUpgradeSetRoles.ReturnType> {
  return Action.promise(
    "hcaAdmin.grantUpgradeSetRoles",
    Impl.grantUpgradeSetRoles,
    client,
    options,
  );
}

export declare namespace grantUpgradeSetRoles {
  /** Options for {@link grantUpgradeSetRoles}. */
  type Options = {
    /** Account to grant. */
    grantee: string;
    /** Role bitmap. */
    roles: bigint;
  };
  /** Submitted transaction hashes and the plan that produced them. */
  type ReturnType = Write.Result;
  /** Errors {@link grantUpgradeSetRoles} can fail with. */
  type ErrorType = Errors.AnyError | HcaError;
}

// Explicit types keep these declarations free of Effect types.

/** Builds the plan without sending anything. */
grantUpgradeSetRoles.prepare = Action.promiseOf(
  "hcaAdmin.grantUpgradeSetRoles.prepare",
  Impl.grantUpgradeSetRolesMethods.prepare,
) as Write.Method<grantUpgradeSetRoles.Options, Plan>;

/** Simulates the plan with `eth_call`, reporting each step. */
grantUpgradeSetRoles.simulate = Action.promiseOf(
  "hcaAdmin.grantUpgradeSetRoles.simulate",
  Impl.grantUpgradeSetRolesMethods.simulate,
) as Write.Method<grantUpgradeSetRoles.Options, Plan.Simulation>;

/** Estimates the gas and ETH the plan needs. */
grantUpgradeSetRoles.estimateGas = Action.promiseOf(
  "hcaAdmin.grantUpgradeSetRoles.estimateGas",
  Impl.grantUpgradeSetRolesMethods.estimateGas,
) as Write.Method<grantUpgradeSetRoles.Options, Plan.Estimate>;

/**
 * Grants root roles on the HCA upgrade set (role admins only). Resolves once the receipt is in.
 *
 * **When to use**
 *
 * Use when the next step depends on the change being on-chain.
 *
 * **Example** (Granting upgrade-set roles and waiting)
 *
 * ```ts
 * const { receipt } = await ens.hcaAdmin.grantUpgradeSetRolesSync({ account, roles })
 * ```
 *
 * **Example** (Granting upgrade-set roles with a standalone call and waiting)
 *
 * ```ts
 * import { Actions } from "@ensforge/hca"
 *
 * await Actions.hcaAdmin.grantUpgradeSetRolesSync(ens, { account, roles })
 * ```
 *
 * **Example** (Granting upgrade-set roles in an Effect program and waiting)
 *
 * ```ts
 * import { Actions } from "@ensforge/hca/effect"
 *
 * yield* Actions.hcaAdmin.grantUpgradeSetRolesSync(ens, { account, roles })
 * ```
 *
 * @throws `Errors.InvalidInputError` (`INVALID_ADDRESS`) for an invalid address.
 * @throws `Errors.HcaError` (`HCA_UNAVAILABLE`) on chains without an HCA deployment.
 * @throws `Errors.TransactionError` (`TRANSACTION_REVERTED`, `RECEIPT_TIMEOUT`) when confirmation fails.
 *
 * @see {@link grantUpgradeSetRoles} to resolve on submission
 * @stability experimental
 * @category hca-admin
 * @since 1.0.0
 */
export function grantUpgradeSetRolesSync(
  client: Like,
  options: grantUpgradeSetRolesSync.Options,
): Promise<grantUpgradeSetRolesSync.ReturnType> {
  return Action.promise(
    "hcaAdmin.grantUpgradeSetRolesSync",
    Impl.grantUpgradeSetRolesSync,
    client,
    options,
  );
}

export declare namespace grantUpgradeSetRolesSync {
  /** Options for {@link grantUpgradeSetRolesSync}. */
  type Options = grantUpgradeSetRoles.Options & Write.SyncOptions;
  /** Receipts plus the submitted hashes and plan. */
  type ReturnType = Write.SyncResult;
  /** Errors {@link grantUpgradeSetRolesSync} can fail with. */
  type ErrorType = Errors.AnyError | HcaError;
}
