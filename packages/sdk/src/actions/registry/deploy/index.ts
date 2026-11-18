import type { Address } from "viem";

import type { Like } from "../../../client/types.js";
import type * as Errors from "../../../errors/index.js";
import * as Action from "../../../internal/action/index.js";
import type { Plan } from "../../../plan/Plan.js";
import type { Write } from "../../../Types.js";
import type * as Role from "../../../utils/Role.js";
import * as Impl from "./effect.js";

/**
 * Deploys an ENSv2 UserRegistry, optionally attaching it as a name's subregistry. Resolves once the transaction is submitted.
 *
 * **When to use**
 *
 * Use to set up the registry for a name's children ahead of time, or with custom roles. Use {@link deploySync} to wait for the receipt.
 *
 * **Details**
 *
 * - A verifiable proxy of the deployment's UserRegistry, at an address known before sending
 *   (`plan.deploys`, returned as `registry`).
 * - `owner` (the signer by default) gets every root role; `emancipated` withholds the roles
 *   that would let owners take children back.
 * - `attachTo` makes it that name's subregistry in the same plan.
 *
 * **Example** (Deploying a subregistry)
 *
 * ```ts
 * const { registry } = await ens.registry.deploy({ attachTo: "alice.eth" })
 * ```
 *
 * **Example** (Deploying a subregistry with a standalone call)
 *
 * ```ts
 * import { Actions } from "@ensforge/sdk"
 *
 * await Actions.registry.deploy(ens, { attachTo: "alice.eth" })
 * ```
 *
 * **Example** (Deploying a subregistry in an Effect program)
 *
 * ```ts
 * import { Actions } from "@ensforge/sdk/effect"
 *
 * yield* Actions.registry.deploy(ens, { attachTo: "alice.eth" })
 * ```
 *
 * @throws `Errors.InvalidInputError` (`INVALID_NAME`, `INVALID_ADDRESS`, `INVALID_ROLES`) for invalid input.
 * @throws `Errors.UnsupportedError` (`UNSUPPORTED_ON_DEPLOYMENT`, `UNSUPPORTED_PROTOCOL`) without ENSv2, or for an ENSv1 `attachTo`.
 * @throws `Errors.UnauthorizedError` (`MISSING_ROLES`) when the account may not set the name's subregistry.
 * @throws `Errors.ConfigError` (`WALLET_NOT_CONFIGURED`) when no signing account is known.
 * @throws `Errors.UserRejectedError` when the user rejects the request.
 *
 * @see {@link Actions.registry.get} to inspect it
 * @stability stable
 * @category writing
 * @since 1.0.0
 */
export function deploy(
  client: Like,
  options: deploy.Options & Write.Options,
): Promise<deploy.ReturnType> {
  return Action.promise("registry.deploy", Impl.deploy, client, options);
}

export declare namespace deploy {
  /** Options for {@link deploy}. */
  type Options = {
    /**
     * Account that gets the root roles.
     *
     * @default the signing account
     */
    owner?: string | undefined;
    /** Extra root role grants, by role name or bitmap. */
    grants?: readonly { account: string; roles: readonly Role.Name[] | bigint }[] | undefined;
    /** Withhold the roles that would let the owners take children back. */
    emancipated?: boolean | undefined;
    /** ENSv2 name to attach it to as subregistry. Normalized automatically. */
    attachTo?: string | undefined;
    /**
     * CREATE2 salt; together with the account it decides the address.
     *
     * @default a random salt
     */
    salt?: bigint | undefined;
  };
  /** Submitted hashes, the plan and the new registry's address. */
  type ReturnType = Write.Result & { readonly registry: Address };
  /** Errors {@link deploy} can fail with. */
  type ErrorType = Errors.WriteError | Errors.InvalidInputError | Errors.UnauthorizedError;
}

// Explicit types keep these declarations free of Effect types.

/** Builds the plan without sending anything. */
deploy.prepare = Action.promiseOf(
  "registry.deploy.prepare",
  Impl.deployMethods.prepare,
) as Write.Method<deploy.Options, Plan>;

/** Simulates the plan with `eth_call`, reporting each step. */
deploy.simulate = Action.promiseOf(
  "registry.deploy.simulate",
  Impl.deployMethods.simulate,
) as Write.Method<deploy.Options, Plan.Simulation>;

/** Estimates the gas and ETH the plan needs. */
deploy.estimateGas = Action.promiseOf(
  "registry.deploy.estimateGas",
  Impl.deployMethods.estimateGas,
) as Write.Method<deploy.Options, Plan.Estimate>;

/**
 * Deploys an ENSv2 UserRegistry, optionally attaching it as a name's subregistry. Resolves once the receipt is in.
 *
 * **When to use**
 *
 * Use when the next step depends on the change being on-chain.
 *
 * **Example** (Deploying a subregistry and waiting)
 *
 * ```ts
 * const { receipt } = await ens.registry.deploySync({ attachTo: "alice.eth" })
 * ```
 *
 * **Example** (Waiting with a standalone call)
 *
 * ```ts
 * import { Actions } from "@ensforge/sdk"
 *
 * await Actions.registry.deploySync(ens, { attachTo: "alice.eth" })
 * ```
 *
 * **Example** (Waiting in an Effect program)
 *
 * ```ts
 * import { Actions } from "@ensforge/sdk/effect"
 *
 * yield* Actions.registry.deploySync(ens, { attachTo: "alice.eth" })
 * ```
 *
 * @throws `Errors.InvalidInputError` (`INVALID_NAME`, `INVALID_ADDRESS`, `INVALID_ROLES`) for invalid input.
 * @throws `Errors.UnsupportedError` (`UNSUPPORTED_ON_DEPLOYMENT`, `UNSUPPORTED_PROTOCOL`) without ENSv2, or for an ENSv1 `attachTo`.
 * @throws `Errors.UnauthorizedError` (`MISSING_ROLES`) when the account may not set the name's subregistry.
 * @throws `Errors.ConfigError` (`WALLET_NOT_CONFIGURED`) when no signing account is known.
 * @throws `Errors.TransactionError` (`TRANSACTION_REVERTED`, `RECEIPT_TIMEOUT`) when confirmation fails.
 *
 * @see {@link deploy} to resolve on submission
 * @stability stable
 * @category writing
 * @since 1.0.0
 */
export function deploySync(
  client: Like,
  options: deploySync.Options,
): Promise<deploySync.ReturnType> {
  return Action.promise("registry.deploySync", Impl.deploySync, client, options);
}

export declare namespace deploySync {
  /** Options for {@link deploySync}. */
  type Options = deploy.Options & Write.SyncOptions;
  /** Receipts, hashes, the plan and the new registry's address. */
  type ReturnType = Write.SyncResult & { readonly registry: Address };
  /** Errors {@link deploySync} can fail with. */
  type ErrorType = Errors.WriteError | Errors.InvalidInputError | Errors.UnauthorizedError;
}

/** Path of the action, e.g. for cache keys. */
deploy.path = "registry.deploy" as const;

/** Path of the action, e.g. for cache keys. */
deploySync.path = "registry.deploySync" as const;
