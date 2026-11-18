import type { Like } from "../../../client/types.js";
import type * as Errors from "../../../errors/index.js";
import * as Action from "../../../internal/action/index.js";
import type { Plan } from "../../../plan/Plan.js";
import type { Write } from "../../../Types.js";
import * as Impl from "./effect.js";

/**
 * Sets the metadata URI of an ENSv2 registry. Resolves once the transaction is submitted.
 *
 * **When to use**
 *
 * Use to point a registry's token metadata at your own service. Use {@link setUriSync} to wait for the receipt.
 *
 * **Details**
 *
 * - Keeps the current URI renderer unless `renderer` is given; `null` removes it.
 * - Needs the `setUri` root role.
 *
 * **Example** (Setting a registry URI)
 *
 * ```ts
 * const { hash } = await ens.registry.setUri({ name: "alice.eth", uri: "https://alice.dev/names/{id}.json" })
 * ```
 *
 * **Example** (Setting a registry URI with a standalone call)
 *
 * ```ts
 * import { Actions } from "@ensforge/sdk"
 *
 * await Actions.registry.setUri(ens, { name: "alice.eth", uri: "https://alice.dev/names/{id}.json" })
 * ```
 *
 * **Example** (Setting a registry URI in an Effect program)
 *
 * ```ts
 * import { Actions } from "@ensforge/sdk/effect"
 *
 * yield* Actions.registry.setUri(ens, { name: "alice.eth", uri: "https://alice.dev/names/{id}.json" })
 * ```
 *
 * @throws `Errors.InvalidInputError` (`INVALID_NAME`, `INVALID_ADDRESS`) for invalid input.
 * @throws `Errors.NotFoundError` (`REGISTRY_NOT_FOUND`) when the name has no subregistry.
 * @throws `Errors.UnauthorizedError` (`MISSING_ROLES`) without the `setUri` root role.
 * @throws `Errors.UserRejectedError` (`USER_REJECTED`) when the user rejects the request.
 * @throws `Errors.WalletError` (`CHAIN_MISMATCH`, `ACCOUNT_NOT_FOUND`) when the wallet is on another chain or has no account to sign with.
 * @throws `Errors.UnsupportedError` (`WALLET_BATCH_UNSUPPORTED`) with `mode: "batch"` or a paymaster when the wallet cannot send calls as one batch.
 *
 * @see {@link Actions.registry.get} to read it
 * @stability stable
 * @category writing
 * @since 1.0.0
 */
export function setUri(
  client: Like,
  options: setUri.Options & Write.Options,
): Promise<setUri.ReturnType> {
  return Action.promise("registry.setUri", Impl.setUri, client, options);
}

export declare namespace setUri {
  /** Options for {@link setUri}. */
  type Options = ({ name: string } | { registry: string }) & {
    /** Metadata URI. */
    uri: string;
    /** URI renderer contract, or `null` for none. */
    renderer?: string | null | undefined;
  };
  /** Submitted transaction hashes and the plan that produced them. */
  type ReturnType = Write.Result;
  /** Errors {@link setUri} can fail with. */
  type ErrorType =
    | Errors.WriteError
    | Errors.InvalidInputError
    | Errors.NotFoundError
    | Errors.UnauthorizedError;
}

// Explicit types keep these declarations free of Effect types.

/** Builds the plan without sending anything. */
setUri.prepare = Action.promiseOf(
  "registry.setUri.prepare",
  Impl.setUriMethods.prepare,
) as Write.Method<setUri.Options, Plan>;

/** Simulates the plan with `eth_call`, reporting each step. */
setUri.simulate = Action.promiseOf(
  "registry.setUri.simulate",
  Impl.setUriMethods.simulate,
) as Write.Method<setUri.Options, Plan.Simulation>;

/** Estimates the gas and ETH the plan needs. */
setUri.estimateGas = Action.promiseOf(
  "registry.setUri.estimateGas",
  Impl.setUriMethods.estimateGas,
) as Write.Method<setUri.Options, Plan.Estimate>;

/**
 * Sets the metadata URI of an ENSv2 registry. Resolves once the receipt is in.
 *
 * **When to use**
 *
 * Use when the next step depends on the change being on-chain.
 *
 * **Example** (Setting a registry URI and waiting)
 *
 * ```ts
 * const { receipt } = await ens.registry.setUriSync({ name: "alice.eth", uri: "https://alice.dev/names/{id}.json" })
 * ```
 *
 * **Example** (Waiting with a standalone call)
 *
 * ```ts
 * import { Actions } from "@ensforge/sdk"
 *
 * await Actions.registry.setUriSync(ens, { name: "alice.eth", uri: "https://alice.dev/names/{id}.json" })
 * ```
 *
 * **Example** (Waiting in an Effect program)
 *
 * ```ts
 * import { Actions } from "@ensforge/sdk/effect"
 *
 * yield* Actions.registry.setUriSync(ens, { name: "alice.eth", uri: "https://alice.dev/names/{id}.json" })
 * ```
 *
 * @throws `Errors.InvalidInputError` (`INVALID_NAME`, `INVALID_ADDRESS`) for invalid input.
 * @throws `Errors.NotFoundError` (`REGISTRY_NOT_FOUND`) when the name has no subregistry.
 * @throws `Errors.UnauthorizedError` (`MISSING_ROLES`) without the `setUri` root role.
 * @throws `Errors.TransactionError` (`TRANSACTION_REVERTED`, `RECEIPT_TIMEOUT`, `NONCE_CONFLICT`) when confirmation fails or the wallet's nonce is already used.
 *
 * @see {@link setUri} to resolve on submission
 * @stability stable
 * @category writing
 * @since 1.0.0
 */
export function setUriSync(
  client: Like,
  options: setUriSync.Options,
): Promise<setUriSync.ReturnType> {
  return Action.promise("registry.setUriSync", Impl.setUriSync, client, options);
}

export declare namespace setUriSync {
  /** Options for {@link setUriSync}. */
  type Options = setUri.Options & Write.SyncOptions;
  /** Receipts plus the submitted hashes and plan. */
  type ReturnType = Write.SyncResult;
  /** Errors {@link setUriSync} can fail with. */
  type ErrorType =
    | Errors.WriteError
    | Errors.InvalidInputError
    | Errors.NotFoundError
    | Errors.UnauthorizedError;
}

/** Path of the action, e.g. for cache keys. */
setUri.path = "registry.setUri" as const;

/** Path of the action, e.g. for cache keys. */
setUriSync.path = "registry.setUriSync" as const;
