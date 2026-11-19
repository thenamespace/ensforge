import type { Address } from "viem";

import type { Like } from "../../../client/types.js";
import type * as Errors from "../../../errors/index.js";
import * as Action from "../../../internal/action/index.js";
import type { Plan } from "../../../plan/Plan.js";
import type { Write } from "../../../Types.js";
import type * as Role from "../../../utils/Role.js";
import type { set as recordSet } from "../../record/set/index.js";
import * as Impl from "./effect.js";

/**
 * Deploys an ENSv2 PermissionedResolver, optionally with records, and points a name at it. Resolves once the transaction is submitted.
 *
 * **When to use**
 *
 * Use to give an ENSv2 name its own resolver, or to set up a resolver shared by several names. Use {@link createSync} to wait for the receipt.
 *
 * **Details**
 *
 * - The resolver is a verifiable proxy from the VerifiableFactory; its address is known before
 *   sending (`plan.deploys`) and returned as `resolver`.
 * - `owner` (the signer by default) gets every role; `grants` add more accounts.
 * - With `name`, `records` are written during initialization and the name is pointed at the
 *   new resolver in the same plan.
 *
 * **Gotchas**
 *
 * - The address depends on the sending account and `salt`: send from the account the plan was
 *   prepared for. A `salt` already used by that account fails with `SALT_TAKEN`, whose
 *   `context.contract` is the existing resolver; point the name at it with `resolver.set`.
 *
 * **Example** (Creating a resolver with records)
 *
 * ```ts
 * const { resolver } = await ens.resolver.create({ name: "alice.eth", records: { texts: { url: "https://alice.dev" } } })
 * ```
 *
 * **Example** (Creating a resolver with records with a standalone call)
 *
 * ```ts
 * import { Actions } from "@ensforge/sdk"
 *
 * await Actions.resolver.create(ens, { name: "alice.eth", records: { texts: { url: "https://alice.dev" } } })
 * ```
 *
 * **Example** (Creating a resolver with records in an Effect program)
 *
 * ```ts
 * import { Actions } from "@ensforge/sdk/effect"
 *
 * yield* Actions.resolver.create(ens, { name: "alice.eth", records: { texts: { url: "https://alice.dev" } } })
 * ```
 *
 * @throws `Errors.InvalidInputError` (`INVALID_NAME`, `INVALID_ADDRESS`, `INVALID_ROLES`, `INVALID_RECORD_VALUE`, `SALT_TAKEN`) for invalid input, or a `salt` whose resolver already exists.
 * @throws `Errors.NameStateError` (`NAME_EXPIRED`, `NAME_RESERVED`, `NAME_NOT_REGISTERED`, `NAME_EXTERNAL`) when the name is not registered, or its parent's namespace manages it outside ENS's registries.
 * @throws `Errors.NameStateError` (`NAME_UNREACHABLE`) when ENSv2 resolution no longer reaches the name.
 * @throws `Errors.ConfigError` (`WALLET_NOT_CONFIGURED`) when no account is known to predict the address.
 * @throws `Errors.UnsupportedError` (`UNSUPPORTED_ON_DEPLOYMENT`, `RESOLVER_PROFILE_UNSUPPORTED`) without ENSv2, or for records a PermissionedResolver cannot store.
 * @throws `Errors.UnauthorizedError` (`NOT_OWNER`, `MISSING_ROLES`) when the account may not point the name at it.
 * @throws `Errors.UserRejectedError` (`USER_REJECTED`) when the user rejects the request.
 * @throws `Errors.WalletError` (`CHAIN_MISMATCH`, `ACCOUNT_NOT_FOUND`) when the wallet is on another chain or has no account to sign with.
 * @throws `Errors.UnsupportedError` (`WALLET_BATCH_UNSUPPORTED`) with `mode: "batch"` or a paymaster when the wallet cannot send calls as one batch.
 *
 * @see {@link Actions.resolver.get} to inspect it
 * @stability stable
 * @category writing
 * @since 1.0.0
 */
export function create(
  client: Like,
  options: create.Options & Write.Options,
): Promise<create.ReturnType> {
  return Action.promise("resolver.create", Impl.create, client, options);
}

export declare namespace create {
  /** Options for {@link create}. */
  type Options = {
    /** Name to point at the new resolver; required for `records`. Normalized automatically. */
    name?: string | undefined;
    /** Records for `name`, written while the resolver is initialized. */
    records?: Omit<recordSet.Options, "name" | "resolver" | "clear" | "pubkey"> | undefined;
    /**
     * Account that gets every resolver role.
     *
     * @default the signing account
     */
    owner?: string | undefined;
    /** Extra role grants, by role name or bitmap. */
    grants?: readonly { account: string; roles: readonly Role.Name[] | bigint }[] | undefined;
    /**
     * CREATE2 salt; together with the account it decides the address.
     *
     * @default a random salt
     */
    salt?: bigint | undefined;
  };
  /** Submitted transaction hashes, the plan and the new resolver's address. */
  type ReturnType = Write.Result & { readonly resolver: Address };
  /** Errors {@link create} can fail with. */
  type ErrorType =
    | Errors.WriteError
    | Errors.InvalidInputError
    | Errors.NameStateError
    | Errors.UnauthorizedError;
}

// Explicit types keep these declarations free of Effect types.

/** Builds the plan without sending anything. */
create.prepare = Action.promiseOf(
  "resolver.create.prepare",
  Impl.createMethods.prepare,
) as Write.Method<create.Options, Plan>;

/** Simulates the plan with `eth_call`, reporting each step. */
create.simulate = Action.promiseOf(
  "resolver.create.simulate",
  Impl.createMethods.simulate,
) as Write.Method<create.Options, Plan.Simulation>;

/** Estimates the gas and ETH the plan needs. */
create.estimateGas = Action.promiseOf(
  "resolver.create.estimateGas",
  Impl.createMethods.estimateGas,
) as Write.Method<create.Options, Plan.Estimate>;

/**
 * Deploys an ENSv2 PermissionedResolver, optionally with records, and points a name at it. Resolves once the receipt is in.
 *
 * **When to use**
 *
 * Use when the next step depends on the change being on-chain.
 *
 * **Example** (Creating a resolver with records and waiting)
 *
 * ```ts
 * const { receipt } = await ens.resolver.createSync({ name: "alice.eth", records: { texts: { url: "https://alice.dev" } } })
 * ```
 *
 * **Example** (Waiting with a standalone call)
 *
 * ```ts
 * import { Actions } from "@ensforge/sdk"
 *
 * await Actions.resolver.createSync(ens, { name: "alice.eth", records: { texts: { url: "https://alice.dev" } } })
 * ```
 *
 * **Example** (Waiting in an Effect program)
 *
 * ```ts
 * import { Actions } from "@ensforge/sdk/effect"
 *
 * yield* Actions.resolver.createSync(ens, { name: "alice.eth", records: { texts: { url: "https://alice.dev" } } })
 * ```
 *
 * @throws `Errors.InvalidInputError` (`INVALID_NAME`, `INVALID_ADDRESS`, `INVALID_ROLES`, `INVALID_RECORD_VALUE`, `SALT_TAKEN`) for invalid input, or a `salt` whose resolver already exists.
 * @throws `Errors.NameStateError` (`NAME_EXPIRED`, `NAME_RESERVED`, `NAME_NOT_REGISTERED`, `NAME_EXTERNAL`) when the name is not registered, or its parent's namespace manages it outside ENS's registries.
 * @throws `Errors.NameStateError` (`NAME_UNREACHABLE`) when ENSv2 resolution no longer reaches the name.
 * @throws `Errors.ConfigError` (`WALLET_NOT_CONFIGURED`) when no account is known to predict the address.
 * @throws `Errors.UnsupportedError` (`UNSUPPORTED_ON_DEPLOYMENT`, `RESOLVER_PROFILE_UNSUPPORTED`) without ENSv2, or for records a PermissionedResolver cannot store.
 * @throws `Errors.UnauthorizedError` (`NOT_OWNER`, `MISSING_ROLES`) when the account may not point the name at it.
 * @throws `Errors.TransactionError` (`TRANSACTION_REVERTED`, `RECEIPT_TIMEOUT`, `NONCE_CONFLICT`) when confirmation fails or the wallet's nonce is already used.
 *
 * @see {@link create} to resolve on submission
 * @stability stable
 * @category writing
 * @since 1.0.0
 */
export function createSync(
  client: Like,
  options: createSync.Options,
): Promise<createSync.ReturnType> {
  return Action.promise("resolver.createSync", Impl.createSync, client, options);
}

export declare namespace createSync {
  /** Options for {@link createSync}. */
  type Options = create.Options & Write.SyncOptions;
  /** Receipts, hashes, the plan and the new resolver's address. */
  type ReturnType = Write.SyncResult & { readonly resolver: Address };
  /** Errors {@link createSync} can fail with. */
  type ErrorType =
    | Errors.WriteError
    | Errors.InvalidInputError
    | Errors.NameStateError
    | Errors.UnauthorizedError;
}

/** Path of the action, e.g. for cache keys. */
create.path = "resolver.create" as const;

/** Path of the action, e.g. for cache keys. */
createSync.path = "resolver.createSync" as const;
