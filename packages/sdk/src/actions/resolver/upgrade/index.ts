import type { Like } from "../../../client/types.js";
import type { AnyError } from "../../../errors/types.js";
import * as Action from "../../../internal/action/index.js";
import type { Plan } from "../../../plan/Plan.js";
import type { Write } from "../../../Types.js";
import * as Impl from "./effect.js";

/**
 * Upgrades the PermissionedResolver of an ENS name to a newer implementation. Resolves once the transaction is submitted.
 *
 * **When to use**
 *
 * Use to move a name's resolver to the deployment's latest PermissionedResolver implementation. Use {@link upgradeSync} to wait for the receipt.
 *
 * **Details**
 *
 * - Targets the deployment's current implementation unless `implementation` is given.
 * - Checks that the target accepts the current implementation (`canUpgradeFrom`) before sending.
 * - Needs the `upgrade` role on the resolver.
 *
 * **Example** (Upgrading a resolver)
 *
 * ```ts
 * const { hash } = await ens.resolver.upgrade({ name: "alice.eth" })
 * ```
 *
 * **Example** (Upgrading a resolver with a standalone call)
 *
 * ```ts
 * import { Actions } from "@ensforge/sdk"
 *
 * await Actions.resolver.upgrade(ens, { name: "alice.eth" })
 * ```
 *
 * **Example** (Upgrading a resolver in an Effect program)
 *
 * ```ts
 * import { Actions } from "@ensforge/sdk/effect"
 *
 * yield* Actions.resolver.upgrade(ens, { name: "alice.eth" })
 * ```
 *
 * @throws `Errors.InvalidInputError` (`INVALID_NAME`, `INVALID_ADDRESS`, `INVALID_RECORD_VALUE`) for invalid input or an up-to-date resolver.
 * @throws `Errors.NotFoundError` (`RESOLVER_NOT_FOUND`) when the name has no resolver of its own.
 * @throws `Errors.UnsupportedError` (`RESOLVER_PROFILE_UNSUPPORTED`, `UPGRADE_NOT_APPROVED`) when the resolver or target cannot be upgraded.
 * @throws `Errors.UnauthorizedError` (`MISSING_ROLES`) without the `upgrade` role.
 * @throws `Errors.UserRejectedError` when the user rejects the request.
 *
 * @see {@link Actions.resolver.get} to inspect the resolver
 * @stability stable
 * @category writing
 * @since 1.0.0
 */
export function upgrade(
  client: Like,
  options: upgrade.Options & Write.Options,
): Promise<upgrade.ReturnType> {
  return Action.promise("resolver.upgrade", Impl.upgrade, client, options);
}

export declare namespace upgrade {
  /** Options for {@link upgrade}. */
  type Options = {
    /** ENS name. Normalized automatically. */
    name: string;
    /**
     * Implementation to upgrade to.
     *
     * @default the deployment's PermissionedResolver implementation
     */
    implementation?: string | undefined;
  };
  /** Submitted transaction hashes and the plan that produced them. */
  type ReturnType = Write.Result;
  /** Errors {@link upgrade} can fail with. */
  type ErrorType = AnyError;
}

// Explicit types keep these declarations free of Effect types.

/** Builds the plan without sending anything. */
upgrade.prepare = Action.promiseOf(
  "resolver.upgrade.prepare",
  Impl.upgradeMethods.prepare,
) as Write.Method<upgrade.Options, Plan>;

/** Simulates the plan with `eth_call`, reporting each step. */
upgrade.simulate = Action.promiseOf(
  "resolver.upgrade.simulate",
  Impl.upgradeMethods.simulate,
) as Write.Method<upgrade.Options, Plan.Simulation>;

/** Estimates the gas and ETH the plan needs. */
upgrade.estimateGas = Action.promiseOf(
  "resolver.upgrade.estimateGas",
  Impl.upgradeMethods.estimateGas,
) as Write.Method<upgrade.Options, Plan.Estimate>;

/**
 * Upgrades the PermissionedResolver of an ENS name to a newer implementation. Resolves once the receipt is in.
 *
 * **When to use**
 *
 * Use when the next step depends on the change being on-chain.
 *
 * **Example** (Upgrading a resolver and waiting)
 *
 * ```ts
 * const { receipt } = await ens.resolver.upgradeSync({ name: "alice.eth" })
 * ```
 *
 * **Example** (Waiting with a standalone call)
 *
 * ```ts
 * import { Actions } from "@ensforge/sdk"
 *
 * await Actions.resolver.upgradeSync(ens, { name: "alice.eth" })
 * ```
 *
 * **Example** (Waiting in an Effect program)
 *
 * ```ts
 * import { Actions } from "@ensforge/sdk/effect"
 *
 * yield* Actions.resolver.upgradeSync(ens, { name: "alice.eth" })
 * ```
 *
 * @throws `Errors.InvalidInputError` (`INVALID_NAME`, `INVALID_ADDRESS`, `INVALID_RECORD_VALUE`) for invalid input or an up-to-date resolver.
 * @throws `Errors.NotFoundError` (`RESOLVER_NOT_FOUND`) when the name has no resolver of its own.
 * @throws `Errors.UnsupportedError` (`RESOLVER_PROFILE_UNSUPPORTED`, `UPGRADE_NOT_APPROVED`) when the resolver or target cannot be upgraded.
 * @throws `Errors.UnauthorizedError` (`MISSING_ROLES`) without the `upgrade` role.
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
  return Action.promise("resolver.upgradeSync", Impl.upgradeSync, client, options);
}

export declare namespace upgradeSync {
  /** Options for {@link upgradeSync}. */
  type Options = upgrade.Options & Write.SyncOptions;
  /** Receipts plus the submitted hashes and plan. */
  type ReturnType = Write.SyncResult;
  /** Errors {@link upgradeSync} can fail with. */
  type ErrorType = AnyError;
}

/** Path of the action, e.g. for cache keys. */
upgrade.path = "resolver.upgrade" as const;

/** Path of the action, e.g. for cache keys. */
upgradeSync.path = "resolver.upgradeSync" as const;
