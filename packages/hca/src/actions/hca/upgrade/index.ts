import type { Errors, Plan, Write } from "@ensforge/sdk";
import { Action, type Like } from "@ensforge/sdk/extension";

import type { HcaError } from "../../../errors/classes/HcaError.js";
import * as Impl from "./effect.js";

/**
 * Upgrades the signer's HCA to an implementation both DAO upgrade sets allow. Resolves once the transaction is submitted.
 *
 * **When to use**
 *
 * Use when the DAO approves a new HCA implementation; the address and sessions stay.
 *
 * **Example** (Upgrading the HCA)
 *
 * ```ts
 * const { hash } = await ens.hca.upgrade({ implementation })
 * ```
 *
 * **Example** (Upgrading the HCA with a standalone call)
 *
 * ```ts
 * import { Actions } from "@ensforge/hca"
 *
 * await Actions.hca.upgrade(ens, { implementation })
 * ```
 *
 * **Example** (Upgrading the HCA in an Effect program)
 *
 * ```ts
 * import { Actions } from "@ensforge/hca/effect"
 *
 * yield* Actions.hca.upgrade(ens, { implementation })
 * ```
 *
 * @throws `Errors.HcaError` (`HCA_UPGRADE_NOT_ALLOWED`) when a DAO set does not allow it.
 * @throws `Errors.InvalidInputError` (`INVALID_ADDRESS`) for an invalid address.
 * @throws `Errors.HcaError` (`HCA_UNAVAILABLE`) on chains without an HCA deployment.
 *
 * @stability experimental
 * @category hca
 * @since 1.0.0
 */
export function upgrade(
  client: Like,
  options: upgrade.Options & Write.Options,
): Promise<upgrade.ReturnType> {
  return Action.promise("hca.upgrade", Impl.upgrade, client, options);
}

export declare namespace upgrade {
  /** Options for {@link upgrade}. */
  type Options = {
    /** Implementation to upgrade to. */
    implementation: string;
  };
  /** Submitted transaction hashes and the plan that produced them. */
  type ReturnType = Write.Result;
  /** Errors {@link upgrade} can fail with. */
  type ErrorType = Errors.WriteError | HcaError | Errors.InvalidInputError;
}

// Explicit types keep these declarations free of Effect types.

/** Builds the plan without sending anything. */
upgrade.prepare = Action.promiseOf(
  "hca.upgrade.prepare",
  Impl.upgradeMethods.prepare,
) as Write.Method<upgrade.Options, Plan>;

/** Simulates the plan with `eth_call`, reporting each step. */
upgrade.simulate = Action.promiseOf(
  "hca.upgrade.simulate",
  Impl.upgradeMethods.simulate,
) as Write.Method<upgrade.Options, Plan.Simulation>;

/** Estimates the gas and ETH the plan needs. */
upgrade.estimateGas = Action.promiseOf(
  "hca.upgrade.estimateGas",
  Impl.upgradeMethods.estimateGas,
) as Write.Method<upgrade.Options, Plan.Estimate>;

/**
 * Upgrades the signer's HCA to an implementation both DAO upgrade sets allow. Resolves once the receipt is in.
 *
 * **When to use**
 *
 * Use when the next step depends on the change being on-chain.
 *
 * **Example** (Upgrading the HCA and waiting)
 *
 * ```ts
 * const { receipt } = await ens.hca.upgradeSync({ implementation })
 * ```
 *
 * **Example** (Upgrading the HCA with a standalone call and waiting)
 *
 * ```ts
 * import { Actions } from "@ensforge/hca"
 *
 * await Actions.hca.upgradeSync(ens, { implementation })
 * ```
 *
 * **Example** (Upgrading the HCA in an Effect program and waiting)
 *
 * ```ts
 * import { Actions } from "@ensforge/hca/effect"
 *
 * yield* Actions.hca.upgradeSync(ens, { implementation })
 * ```
 *
 * @throws `Errors.HcaError` (`HCA_UPGRADE_NOT_ALLOWED`) when a DAO set does not allow it.
 * @throws `Errors.InvalidInputError` (`INVALID_ADDRESS`) for an invalid address.
 * @throws `Errors.HcaError` (`HCA_UNAVAILABLE`) on chains without an HCA deployment.
 * @throws `Errors.TransactionError` (`TRANSACTION_REVERTED`, `RECEIPT_TIMEOUT`) when confirmation fails.
 *
 * @see {@link upgrade} to resolve on submission
 * @stability experimental
 * @category hca
 * @since 1.0.0
 */
export function upgradeSync(
  client: Like,
  options: upgradeSync.Options,
): Promise<upgradeSync.ReturnType> {
  return Action.promise("hca.upgradeSync", Impl.upgradeSync, client, options);
}

export declare namespace upgradeSync {
  /** Options for {@link upgradeSync}. */
  type Options = upgrade.Options & Write.SyncOptions;
  /** Receipts plus the submitted hashes and plan. */
  type ReturnType = Write.SyncResult;
  /** Errors {@link upgradeSync} can fail with. */
  type ErrorType = Errors.WriteError | HcaError | Errors.InvalidInputError;
}

/** Path of the action, e.g. for cache keys. */
upgrade.path = "hca.upgrade" as const;

/** Path of the action, e.g. for cache keys. */
upgradeSync.path = "hca.upgradeSync" as const;
