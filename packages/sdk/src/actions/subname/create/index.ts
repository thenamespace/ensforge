import type { Like } from "../../../client/types.js";
import type * as Errors from "../../../errors/index.js";
import * as Action from "../../../internal/action/index.js";
import type { Plan } from "../../../plan/Plan.js";
import type { Write } from "../../../Types.js";
import type * as Fuse from "../../../utils/Fuse.js";
import type * as Role from "../../../utils/Role.js";
import type { set as recordSet } from "../../record/set/index.js";
import * as Impl from "./effect.js";

/**
 * Creates a subname, routed by its parent: an ENSv2 subregistry, the ENSv1 registry or the NameWrapper. Resolves once the transaction is submitted.
 *
 * **When to use**
 *
 * Use to give out names under one you own, such as `pay.alice.eth`. Use {@link createSync} to wait for the receipt.
 *
 * **Details**
 *
 * - ENSv2 parents: the child is registered in the parent's subregistry. A parent without one
 *   gets a UserRegistry deployed and attached in the same plan (`plan.deploys`).
 * - ENSv2 children never expire by default and their owner gets the roles the `.eth`
 *   registrar grants (resolver, subregistry, transfers); `roles` and `expiry` override them.
 * - ENSv1 parents use `setSubnodeRecord`; wrapped parents take `fuses` and an `expiry`.
 * - By default the child gets its own PermissionedResolver with `records` written at creation;
 *   `resolver: "parent"` shares the parent's resolver, `null` creates it without one.
 * - `upsert` updates an existing child's resolver and records instead of failing.
 *
 * **Gotchas**
 *
 * - A subregistry deployed here is not emancipated unless `emancipate` is set: its owners can
 *   remove and repoint children.
 * - Under a wrapped parent, `parentCannotControl` and `canExtendExpiry` need `cannotUnwrap`
 *   burned on the parent (`INVALID_RECORD_VALUE`), and an emancipated child cannot be updated
 *   until it expires (`FUSE_BURNED`).
 *
 * **Example** (Creating a subname)
 *
 * ```ts
 * const { hash } = await ens.subname.create({ name: "pay.alice.eth", records: { texts: { url: "https://pay.alice.dev" } } })
 * ```
 *
 * **Example** (Creating a subname with a standalone call)
 *
 * ```ts
 * import { Actions } from "@ensforge/sdk"
 *
 * await Actions.subname.create(ens, { name: "pay.alice.eth", records: { texts: { url: "https://pay.alice.dev" } } })
 * ```
 *
 * **Example** (Creating a subname in an Effect program)
 *
 * ```ts
 * import { Actions } from "@ensforge/sdk/effect"
 *
 * yield* Actions.subname.create(ens, { name: "pay.alice.eth", records: { texts: { url: "https://pay.alice.dev" } } })
 * ```
 *
 * @throws `Errors.InvalidInputError` (`INVALID_NAME`, `INVALID_ADDRESS`, `INVALID_ROLES`, `INVALID_RECORD_VALUE`) for invalid input.
 * @throws `Errors.NameStateError` (`NAME_NOT_AVAILABLE`, `NAME_NOT_REGISTERED`, `NAME_EXPIRED`) when the child exists or the parent is not registered.
 * @throws `Errors.NameStateError` (`NAME_RESERVED`, `NAME_UNREACHABLE`) when the parent is reserved or ENSv2 resolution no longer reaches it.
 * @throws `Errors.UnsupportedError` (`UNSUPPORTED_PROTOCOL`) for `roles` on ENSv1 or `fuses` on unwrapped parents.
 * @throws `Errors.UnauthorizedError` (`MISSING_ROLES`, `NOT_OWNER`, `FUSE_BURNED`) when the account may not create children.
 * @throws `Errors.ConfigError` (`WALLET_NOT_CONFIGURED`) when no signing account is known.
 * @throws `Errors.UserRejectedError` (`USER_REJECTED`) when the user rejects the request.
 * @throws `Errors.WalletError` (`CHAIN_MISMATCH`, `ACCOUNT_NOT_FOUND`) when the wallet is on another chain or has no account to sign with.
 * @throws `Errors.UnsupportedError` (`WALLET_BATCH_UNSUPPORTED`) with `mode: "batch"` or a paymaster when the wallet cannot send calls as one batch.
 *
 * @see {@link Actions.subname.remove} to remove it
 * @stability stable
 * @category writing
 * @since 1.0.0
 */
export function create(
  client: Like,
  options: create.Options & Write.Options,
): Promise<create.ReturnType> {
  return Action.promise("subname.create", Impl.create, client, options);
}

export declare namespace create {
  /** Options for {@link create}. */
  type Options = {
    /** Full name of the child, e.g. `pay.alice.eth`. Normalized automatically. */
    name: string;
    /**
     * Owner of the child.
     *
     * @default the signing account
     */
    owner?: string | undefined;
    /**
     * Resolver of the child. By default it gets its own PermissionedResolver; `"parent"` uses
     * the parent's resolver and `null` none.
     */
    // oxlint-disable-next-line typescript/no-redundant-type-constituents -- the literal or explicit type argument documents the public type
    resolver?: string | "parent" | null | undefined;
    /** Records of the child. */
    records?: Omit<recordSet.Options, "name" | "resolver" | "clear" | "pubkey"> | undefined;
    /**
     * Expiry as a Unix timestamp.
     *
     * @default never for ENSv2 children; for wrapped children, the maximum when `parentCannotControl` is burned, else none
     */
    expiry?: bigint | undefined;
    /** NameWrapper fuses to burn on the child (wrapped ENSv1 parents). */
    fuses?: readonly Fuse.Name[] | undefined;
    /** ENSv2 roles for the child's owner, by name or bitmap. */
    roles?: readonly Role.Name[] | bigint | undefined;
    /** Emancipate the parent's subregistry if this plan deploys it. */
    emancipate?: boolean | undefined;
    /** Update the child's resolver and records if it already exists. */
    upsert?: boolean | undefined;
  };
  /** Submitted transaction hashes and the plan that produced them. */
  type ReturnType = Write.Result;
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
  "subname.create.prepare",
  Impl.createMethods.prepare,
) as Write.Method<create.Options, Plan>;

/** Simulates the plan with `eth_call`, reporting each step. */
create.simulate = Action.promiseOf(
  "subname.create.simulate",
  Impl.createMethods.simulate,
) as Write.Method<create.Options, Plan.Simulation>;

/** Estimates the gas and ETH the plan needs. */
create.estimateGas = Action.promiseOf(
  "subname.create.estimateGas",
  Impl.createMethods.estimateGas,
) as Write.Method<create.Options, Plan.Estimate>;

/**
 * Creates a subname, routed by its parent: an ENSv2 subregistry, the ENSv1 registry or the NameWrapper. Resolves once the receipt is in.
 *
 * **When to use**
 *
 * Use when the next step depends on the change being on-chain.
 *
 * **Example** (Creating a subname and waiting)
 *
 * ```ts
 * const { receipt } = await ens.subname.createSync({ name: "pay.alice.eth", records: { texts: { url: "https://pay.alice.dev" } } })
 * ```
 *
 * **Example** (Waiting with a standalone call)
 *
 * ```ts
 * import { Actions } from "@ensforge/sdk"
 *
 * await Actions.subname.createSync(ens, { name: "pay.alice.eth", records: { texts: { url: "https://pay.alice.dev" } } })
 * ```
 *
 * **Example** (Waiting in an Effect program)
 *
 * ```ts
 * import { Actions } from "@ensforge/sdk/effect"
 *
 * yield* Actions.subname.createSync(ens, { name: "pay.alice.eth", records: { texts: { url: "https://pay.alice.dev" } } })
 * ```
 *
 * @throws `Errors.InvalidInputError` (`INVALID_NAME`, `INVALID_ADDRESS`, `INVALID_ROLES`, `INVALID_RECORD_VALUE`) for invalid input.
 * @throws `Errors.NameStateError` (`NAME_NOT_AVAILABLE`, `NAME_NOT_REGISTERED`, `NAME_EXPIRED`) when the child exists or the parent is not registered.
 * @throws `Errors.NameStateError` (`NAME_RESERVED`, `NAME_UNREACHABLE`) when the parent is reserved or ENSv2 resolution no longer reaches it.
 * @throws `Errors.UnsupportedError` (`UNSUPPORTED_PROTOCOL`) for `roles` on ENSv1 or `fuses` on unwrapped parents.
 * @throws `Errors.UnauthorizedError` (`MISSING_ROLES`, `NOT_OWNER`, `FUSE_BURNED`) when the account may not create children.
 * @throws `Errors.ConfigError` (`WALLET_NOT_CONFIGURED`) when no signing account is known.
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
  return Action.promise("subname.createSync", Impl.createSync, client, options);
}

export declare namespace createSync {
  /** Options for {@link createSync}. */
  type Options = create.Options & Write.SyncOptions;
  /** Receipts plus the submitted hashes and plan. */
  type ReturnType = Write.SyncResult;
  /** Errors {@link createSync} can fail with. */
  type ErrorType =
    | Errors.WriteError
    | Errors.InvalidInputError
    | Errors.NameStateError
    | Errors.UnauthorizedError;
}

/** Path of the action, e.g. for cache keys. */
create.path = "subname.create" as const;

/** Path of the action, e.g. for cache keys. */
createSync.path = "subname.createSync" as const;
