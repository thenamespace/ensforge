import type { Like } from "../../../client/types.js";
import type * as Errors from "../../../errors/index.js";
import * as Action from "../../../internal/action/index.js";
import type { Plan } from "../../../plan/Plan.js";
import type { Write } from "../../../Types.js";
import * as Impl from "./effect.js";

/**
 * Upgrades an ENSv2 registry to the deployment's latest implementation. Resolves once the transaction is submitted.
 *
 * **When to use**
 *
 * Use to move a subregistry to the current UserRegistry implementation. Use {@link upgradeSync} to wait for the receipt.
 *
 * **Details**
 *
 * - Checks before signing what {@link Actions.registry.get} reports: the `upgrade` root role,
 *   the target accepting the current implementation (`canUpgradeFrom`), and for emancipated
 *   registries the upgrade set.
 *
 * **Example** (Upgrading a subregistry)
 *
 * ```ts
 * const { hash } = await ens.registry.upgrade({ name: "alice.eth" })
 * ```
 *
 * **Example** (Upgrading a subregistry with a standalone call)
 *
 * ```ts
 * import { Actions } from "@ensforge/sdk"
 *
 * await Actions.registry.upgrade(ens, { name: "alice.eth" })
 * ```
 *
 * **Example** (Upgrading a subregistry in an Effect program)
 *
 * ```ts
 * import { Actions } from "@ensforge/sdk/effect"
 *
 * yield* Actions.registry.upgrade(ens, { name: "alice.eth" })
 * ```
 *
 * @throws `Errors.InvalidInputError` (`INVALID_NAME`, `INVALID_ADDRESS`, `INVALID_RECORD_VALUE`) for invalid input or an up-to-date registry.
 * @throws `Errors.NotFoundError` (`REGISTRY_NOT_FOUND`) when the name has no subregistry.
 * @throws `Errors.UnsupportedError` (`UPGRADE_NOT_APPROVED`) when the target is not approved.
 * @throws `Errors.UnauthorizedError` (`MISSING_ROLES`) without the `upgrade` root role.
 * @throws `Errors.ConfigError` (`WALLET_NOT_CONFIGURED`) when no signing account is known.
 * @throws `Errors.UserRejectedError` when the user rejects the request.
 *
 * @see {@link Actions.registry.get} to check eligibility
 * @stability stable
 * @category writing
 * @since 1.0.0
 */
export function upgrade(
  client: Like,
  options: upgrade.Options & Write.Options,
): Promise<upgrade.ReturnType> {
  return Action.promise("registry.upgrade", Impl.upgrade, client, options);
}

export declare namespace upgrade {
  /** Options for {@link upgrade}. */
  type Options = ({ name: string } | { registry: string }) & {
    /**
     * Implementation to upgrade to.
     *
     * @default the deployment's implementation for this kind of registry
     */
    implementation?: string | undefined;
  };
  /** Submitted transaction hashes and the plan that produced them. */
  type ReturnType = Write.Result;
  /** Errors {@link upgrade} can fail with. */
  type ErrorType =
    | Errors.WriteError
    | Errors.InvalidInputError
    | Errors.NotFoundError
    | Errors.UnauthorizedError;
}

// Explicit types keep these declarations free of Effect types.

/** Builds the plan without sending anything. */
upgrade.prepare = Action.promiseOf(
  "registry.upgrade.prepare",
  Impl.upgradeMethods.prepare,
) as Write.Method<upgrade.Options, Plan>;

/** Simulates the plan with `eth_call`, reporting each step. */
upgrade.simulate = Action.promiseOf(
  "registry.upgrade.simulate",
  Impl.upgradeMethods.simulate,
) as Write.Method<upgrade.Options, Plan.Simulation>;

/** Estimates the gas and ETH the plan needs. */
upgrade.estimateGas = Action.promiseOf(
  "registry.upgrade.estimateGas",
  Impl.upgradeMethods.estimateGas,
) as Write.Method<upgrade.Options, Plan.Estimate>;

/**
 * Upgrades an ENSv2 registry to the deployment's latest implementation. Resolves once the receipt is in.
 *
 * **When to use**
 *
 * Use when the next step depends on the change being on-chain.
 *
 * **Example** (Upgrading a subregistry and waiting)
 *
 * ```ts
 * const { receipt } = await ens.registry.upgradeSync({ name: "alice.eth" })
 * ```
 *
 * **Example** (Waiting with a standalone call)
 *
 * ```ts
 * import { Actions } from "@ensforge/sdk"
 *
 * await Actions.registry.upgradeSync(ens, { name: "alice.eth" })
 * ```
 *
 * **Example** (Waiting in an Effect program)
 *
 * ```ts
 * import { Actions } from "@ensforge/sdk/effect"
 *
 * yield* Actions.registry.upgradeSync(ens, { name: "alice.eth" })
 * ```
 *
 * @throws `Errors.InvalidInputError` (`INVALID_NAME`, `INVALID_ADDRESS`, `INVALID_RECORD_VALUE`) for invalid input or an up-to-date registry.
 * @throws `Errors.NotFoundError` (`REGISTRY_NOT_FOUND`) when the name has no subregistry.
 * @throws `Errors.UnsupportedError` (`UPGRADE_NOT_APPROVED`) when the target is not approved.
 * @throws `Errors.UnauthorizedError` (`MISSING_ROLES`) without the `upgrade` root role.
 * @throws `Errors.ConfigError` (`WALLET_NOT_CONFIGURED`) when no signing account is known.
 * @throws `Errors.TransactionError` (`TRANSACTION_REVERTED`, `RECEIPT_TIMEOUT`) when confirmation fails.
 *
 * @see {@link upgrade} to resolve on submission
 * @stability stable
 * @category writing
 * @since 1.0.0
 */
export function upgradeSync(
  client: Like,
  options: upgradeSync.Options,
): Promise<upgradeSync.ReturnType> {
  return Action.promise("registry.upgradeSync", Impl.upgradeSync, client, options);
}

export declare namespace upgradeSync {
  /** Options for {@link upgradeSync}. */
  type Options = upgrade.Options & Write.SyncOptions;
  /** Receipts plus the submitted hashes and plan. */
  type ReturnType = Write.SyncResult;
  /** Errors {@link upgradeSync} can fail with. */
  type ErrorType =
    | Errors.WriteError
    | Errors.InvalidInputError
    | Errors.NotFoundError
    | Errors.UnauthorizedError;
}

/** Path of the action, e.g. for cache keys. */
upgrade.path = "registry.upgrade" as const;

/** Path of the action, e.g. for cache keys. */
upgradeSync.path = "registry.upgradeSync" as const;
