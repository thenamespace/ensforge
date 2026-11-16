import type { Like } from "../../../client/types.js";
import type { AnyError } from "../../../errors/types.js";
import * as Action from "../../../internal/action/index.js";
import type { Plan } from "../../../plan/Plan.js";
import type { Write } from "../../../Types.js";
import type * as Role from "../../../utils/Role.js";
import * as Impl from "./effect.js";

/**
 * Revokes ENSv2 roles from an account on a name, or at the root of a registry or resolver. Resolves once the transaction is submitted.
 *
 * **When to use**
 *
 * Use to take back powers granted with {@link Actions.role.grant}. Use {@link revokeSync} to wait for the receipt.
 *
 * **Details**
 *
 * - Revoking needs the matching admin roles.
 * - Some roles regenerate the name's token ID; the plan carries a `TOKEN_ID_REGENERATED` warning.
 *
 * **Example** (Revoking a role)
 *
 * ```ts
 * const { hash } = await ens.role.revoke({ name: "alice.eth", holder: "0xB0b0000000000000000000000000000000000000", roles: ["renew"], target: "registry" })
 * ```
 *
 * **Example** (Revoking a role with a standalone call)
 *
 * ```ts
 * import { Actions } from "@ensforge/core"
 *
 * await Actions.role.revoke(ens, { name: "alice.eth", holder: "0xB0b0000000000000000000000000000000000000", roles: ["renew"], target: "registry" })
 * ```
 *
 * **Example** (Revoking a role in an Effect program)
 *
 * ```ts
 * import { Actions } from "@ensforge/core/effect"
 *
 * yield* Actions.role.revoke(ens, { name: "alice.eth", holder: "0xB0b0000000000000000000000000000000000000", roles: ["renew"], target: "registry" })
 * ```
 *
 * @throws `Errors.InvalidInputError` (`INVALID_NAME`, `INVALID_ADDRESS`, `INVALID_ROLES`, `INVALID_RECORD_VALUE`) for invalid input or targets.
 * @throws `Errors.UnsupportedError` (`UNSUPPORTED_PROTOCOL`) for ENSv1 names.
 * @throws `Errors.UnauthorizedError` (`CANNOT_GRANT_ROLES`) without the admin roles.
 * @throws `Errors.UserRejectedError` when the user rejects the request.
 *
 * @see {@link Actions.role.get} to read roles
 * @stability stable
 * @category writing
 * @since 1.0.0
 */
export function revoke(
  client: Like,
  options: revoke.Options & Write.Options,
): Promise<revoke.ReturnType> {
  return Action.promise("role.revoke", Impl.revoke, client, options);
}

export declare namespace revoke {
  /** Options for {@link revoke}. */
  type Options = {
    /** Account that loses the roles. */
    holder: string;
    /** Roles by name, e.g. `["setResolver"]`, or as a bitmap. */
    roles: readonly Role.Name[] | bigint;
    /** Registry or PermissionedResolver roles (resolvers: root only). */
    target: "registry" | "resolver";
    /** ENS name whose registry or resolver to use. Normalized automatically. */
    name?: string | undefined;
    /** Registry or resolver address, instead of the name's. */
    contract?: string | undefined;
    /** Root roles, applying to every name, instead of the name's. */
    root?: boolean | undefined;
  };
  /** Submitted transaction hashes and the plan that produced them. */
  type ReturnType = Write.Result;
  /** Errors {@link revoke} can fail with. */
  type ErrorType = AnyError;
}

// Explicit types keep these declarations free of Effect types.

/** Builds the plan without sending anything. */
revoke.prepare = Action.promiseOf(
  "role.revoke.prepare",
  Impl.revokeMethods.prepare,
) as Write.Method<revoke.Options, Plan>;

/** Simulates the plan with `eth_call`, reporting each step. */
revoke.simulate = Action.promiseOf(
  "role.revoke.simulate",
  Impl.revokeMethods.simulate,
) as Write.Method<revoke.Options, Plan.Simulation>;

/** Estimates the gas and ETH the plan needs. */
revoke.estimateGas = Action.promiseOf(
  "role.revoke.estimateGas",
  Impl.revokeMethods.estimateGas,
) as Write.Method<revoke.Options, Plan.Estimate>;

/**
 * Revokes ENSv2 roles from an account on a name, or at the root of a registry or resolver. Resolves once the receipt is in.
 *
 * **When to use**
 *
 * Use when the next step depends on the change being on-chain.
 *
 * **Example** (Revoking a role and waiting)
 *
 * ```ts
 * const { receipt } = await ens.role.revokeSync({ name: "alice.eth", holder: "0xB0b0000000000000000000000000000000000000", roles: ["renew"], target: "registry" })
 * ```
 *
 * **Example** (Waiting with a standalone call)
 *
 * ```ts
 * import { Actions } from "@ensforge/core"
 *
 * await Actions.role.revokeSync(ens, { name: "alice.eth", holder: "0xB0b0000000000000000000000000000000000000", roles: ["renew"], target: "registry" })
 * ```
 *
 * **Example** (Waiting in an Effect program)
 *
 * ```ts
 * import { Actions } from "@ensforge/core/effect"
 *
 * yield* Actions.role.revokeSync(ens, { name: "alice.eth", holder: "0xB0b0000000000000000000000000000000000000", roles: ["renew"], target: "registry" })
 * ```
 *
 * @throws `Errors.InvalidInputError` (`INVALID_NAME`, `INVALID_ADDRESS`, `INVALID_ROLES`, `INVALID_RECORD_VALUE`) for invalid input or targets.
 * @throws `Errors.UnsupportedError` (`UNSUPPORTED_PROTOCOL`) for ENSv1 names.
 * @throws `Errors.UnauthorizedError` (`CANNOT_GRANT_ROLES`) without the admin roles.
 * @throws `Errors.TransactionError` (`TRANSACTION_REVERTED`, `RECEIPT_TIMEOUT`) when confirmation fails.
 *
 * @see {@link revoke} to resolve on submission
 * @stability stable
 * @category writing
 * @since 1.0.0
 */
export function revokeSync(
  client: Like,
  options: revokeSync.Options,
): Promise<revokeSync.ReturnType> {
  return Action.promise("role.revokeSync", Impl.revokeSync, client, options);
}

export declare namespace revokeSync {
  /** Options for {@link revokeSync}. */
  type Options = revoke.Options & Write.SyncOptions;
  /** Receipts plus the submitted hashes and plan. */
  type ReturnType = Write.SyncResult;
  /** Errors {@link revokeSync} can fail with. */
  type ErrorType = AnyError;
}
