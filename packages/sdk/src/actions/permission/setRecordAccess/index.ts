import type { Like } from "../../../client/types.js";
import type { AnyError } from "../../../errors/types.js";
import * as Action from "../../../internal/action/index.js";
import type { Plan } from "../../../plan/Plan.js";
import type { Write } from "../../../Types.js";
import type { Selection } from "../../record/get/types.js";
import * as Impl from "./effect.js";

/**
 * Lets another account edit a name's records, or takes that access back. Resolves once the transaction is submitted.
 *
 * **When to use**
 *
 * Use to let a teammate, bot or app manage some or all of a profile. Use {@link setRecordAccessSync} to wait for the receipt.
 *
 * **Details**
 *
 * - PermissionedResolver: exact setter roles per record (one text key, coin, data key, ABI
 *   content type or interface), or every setter role with `records: "all"`.
 * - Public resolvers: a per-name delegate, which can edit every record of the name.
 * - `revoke` takes the same access back.
 *
 * **Gotchas**
 *
 * - PermissionedResolver roles cover every name on that resolver. Names share a resolver
 *   with `resolver: "parent"`; give names their own resolver to keep access per name.
 * - Delegates and `"all"` need `allowScopeWidening: true`.
 *
 * **Example** (Letting an app edit a text record)
 *
 * ```ts
 * const { hash } = await ens.permission.setRecordAccess({ name: "alice.eth", grantee: "0xB0b0000000000000000000000000000000000000", records: { texts: ["url"] } })
 * ```
 *
 * **Example** (Letting an app edit a text record with a standalone call)
 *
 * ```ts
 * import { Actions } from "@ensforge/sdk"
 *
 * await Actions.permission.setRecordAccess(ens, { name: "alice.eth", grantee: "0xB0b0000000000000000000000000000000000000", records: { texts: ["url"] } })
 * ```
 *
 * **Example** (Letting an app edit a text record in an Effect program)
 *
 * ```ts
 * import { Actions } from "@ensforge/sdk/effect"
 *
 * yield* Actions.permission.setRecordAccess(ens, { name: "alice.eth", grantee: "0xB0b0000000000000000000000000000000000000", records: { texts: ["url"] } })
 * ```
 *
 * @throws `Errors.InvalidInputError` (`INVALID_NAME`, `INVALID_ADDRESS`, `INVALID_RECORD_VALUE`) for invalid input or an unconfirmed widening.
 * @throws `Errors.NotFoundError` (`RESOLVER_NOT_FOUND`) when the name has no resolver.
 * @throws `Errors.UnsupportedError` (`RESOLVER_PROFILE_UNSUPPORTED`) for public keys on a PermissionedResolver.
 * @throws `Errors.UnauthorizedError` (`CANNOT_GRANT_ROLES`, `NOT_OWNER`) when the account may not grant access.
 * @throws `Errors.UserRejectedError` when the user rejects the request.
 *
 * @see {@link Actions.permission.get} to read access
 * @stability stable
 * @category writing
 * @since 1.0.0
 */
export function setRecordAccess(
  client: Like,
  options: setRecordAccess.Options & Write.Options,
): Promise<setRecordAccess.ReturnType> {
  return Action.promise("permission.setRecordAccess", Impl.setRecordAccess, client, options);
}

export declare namespace setRecordAccess {
  /** Options for {@link setRecordAccess}. */
  type Options = {
    /** ENS name. Normalized automatically. */
    name: string;
    /** Account that gets (or loses) access. */
    grantee: string;
    /**
     * Records in the `record.get` selection shape, or `"all"`.
     *
     * @default "all"
     */
    records?: Selection | "all" | undefined;
    /** Confirm grants wider than the listed records (delegates, `"all"`). */
    allowScopeWidening?: boolean | undefined;
    /** Take the access back. */
    revoke?: boolean | undefined;
  };
  /** Submitted transaction hashes and the plan that produced them. */
  type ReturnType = Write.Result;
  /** Errors {@link setRecordAccess} can fail with. */
  type ErrorType = AnyError;
}

// Explicit types keep these declarations free of Effect types.

/** Builds the plan without sending anything. */
setRecordAccess.prepare = Action.promiseOf(
  "permission.setRecordAccess.prepare",
  Impl.setRecordAccessMethods.prepare,
) as Write.Method<setRecordAccess.Options, Plan>;

/** Simulates the plan with `eth_call`, reporting each step. */
setRecordAccess.simulate = Action.promiseOf(
  "permission.setRecordAccess.simulate",
  Impl.setRecordAccessMethods.simulate,
) as Write.Method<setRecordAccess.Options, Plan.Simulation>;

/** Estimates the gas and ETH the plan needs. */
setRecordAccess.estimateGas = Action.promiseOf(
  "permission.setRecordAccess.estimateGas",
  Impl.setRecordAccessMethods.estimateGas,
) as Write.Method<setRecordAccess.Options, Plan.Estimate>;

/**
 * Lets another account edit a name's records, or takes that access back. Resolves once the receipt is in.
 *
 * **When to use**
 *
 * Use when the next step depends on the change being on-chain.
 *
 * **Example** (Letting an app edit a text record and waiting)
 *
 * ```ts
 * const { receipt } = await ens.permission.setRecordAccessSync({ name: "alice.eth", grantee: "0xB0b0000000000000000000000000000000000000", records: { texts: ["url"] } })
 * ```
 *
 * **Example** (Waiting with a standalone call)
 *
 * ```ts
 * import { Actions } from "@ensforge/sdk"
 *
 * await Actions.permission.setRecordAccessSync(ens, { name: "alice.eth", grantee: "0xB0b0000000000000000000000000000000000000", records: { texts: ["url"] } })
 * ```
 *
 * **Example** (Waiting in an Effect program)
 *
 * ```ts
 * import { Actions } from "@ensforge/sdk/effect"
 *
 * yield* Actions.permission.setRecordAccessSync(ens, { name: "alice.eth", grantee: "0xB0b0000000000000000000000000000000000000", records: { texts: ["url"] } })
 * ```
 *
 * @throws `Errors.InvalidInputError` (`INVALID_NAME`, `INVALID_ADDRESS`, `INVALID_RECORD_VALUE`) for invalid input or an unconfirmed widening.
 * @throws `Errors.NotFoundError` (`RESOLVER_NOT_FOUND`) when the name has no resolver.
 * @throws `Errors.UnsupportedError` (`RESOLVER_PROFILE_UNSUPPORTED`) for public keys on a PermissionedResolver.
 * @throws `Errors.UnauthorizedError` (`CANNOT_GRANT_ROLES`, `NOT_OWNER`) when the account may not grant access.
 * @throws `Errors.TransactionError` (`TRANSACTION_REVERTED`, `RECEIPT_TIMEOUT`) when confirmation fails.
 *
 * @see {@link setRecordAccess} to resolve on submission
 * @stability stable
 * @category writing
 * @since 1.0.0
 */
export function setRecordAccessSync(
  client: Like,
  options: setRecordAccessSync.Options,
): Promise<setRecordAccessSync.ReturnType> {
  return Action.promise(
    "permission.setRecordAccessSync",
    Impl.setRecordAccessSync,
    client,
    options,
  );
}

export declare namespace setRecordAccessSync {
  /** Options for {@link setRecordAccessSync}. */
  type Options = setRecordAccess.Options & Write.SyncOptions;
  /** Receipts plus the submitted hashes and plan. */
  type ReturnType = Write.SyncResult;
  /** Errors {@link setRecordAccessSync} can fail with. */
  type ErrorType = AnyError;
}

/** Path of the action, e.g. for cache keys. */
setRecordAccess.path = "permission.setRecordAccess" as const;

/** Path of the action, e.g. for cache keys. */
setRecordAccessSync.path = "permission.setRecordAccessSync" as const;
