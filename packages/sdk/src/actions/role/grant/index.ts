import type { Like } from "../../../client/types.js";
import type { AnyError } from "../../../errors/types.js";
import * as Action from "../../../internal/action/index.js";
import type { Plan } from "../../../plan/Plan.js";
import type { Write } from "../../../Types.js";
import type * as Role from "../../../utils/Role.js";
import * as Impl from "./effect.js";

/**
 * Grants ENSv2 roles to an account on a name, or at the root of a registry or resolver. Resolves once the transaction is submitted.
 *
 * **When to use**
 *
 * Use to delegate specific powers, such as renewing or changing the resolver, without transferring a name. Use {@link grantSync} to wait for the receipt.
 *
 * **Details**
 *
 * - Name roles go to the name's resource in the registry holding it; root roles apply to every
 *   name in that registry or on that resolver.
 * - Granting needs the matching admin roles.
 * - Some roles regenerate the name's token ID; the plan carries a `TOKEN_ID_REGENERATED` warning.
 *
 * **Example** (Granting a role)
 *
 * ```ts
 * const { hash } = await ens.role.grant({ name: "alice.eth", grantee: "0xB0b0000000000000000000000000000000000000", roles: ["renew"], target: "registry" })
 * ```
 *
 * **Example** (Granting a role with a standalone call)
 *
 * ```ts
 * import { Actions } from "@ensforge/sdk"
 *
 * await Actions.role.grant(ens, { name: "alice.eth", grantee: "0xB0b0000000000000000000000000000000000000", roles: ["renew"], target: "registry" })
 * ```
 *
 * **Example** (Granting a role in an Effect program)
 *
 * ```ts
 * import { Actions } from "@ensforge/sdk/effect"
 *
 * yield* Actions.role.grant(ens, { name: "alice.eth", grantee: "0xB0b0000000000000000000000000000000000000", roles: ["renew"], target: "registry" })
 * ```
 *
 * @throws `Errors.InvalidInputError` (`INVALID_NAME`, `INVALID_ADDRESS`, `INVALID_ROLES`, `INVALID_RECORD_VALUE`) for invalid input or targets.
 * @throws `Errors.UnsupportedError` (`UNSUPPORTED_PROTOCOL`) for ENSv1 names.
 * @throws `Errors.UnauthorizedError` (`CANNOT_GRANT_ROLES`) without the admin roles.
 * @throws `Errors.InvalidInputError` (`INVALID_ROLES`) when a role already has the maximum of 15 holders.
 * @throws `Errors.UserRejectedError` when the user rejects the request.
 *
 * @see {@link Actions.role.get} to read roles
 * @stability stable
 * @category writing
 * @since 1.0.0
 */
export function grant(
  client: Like,
  options: grant.Options & Write.Options,
): Promise<grant.ReturnType> {
  return Action.promise("role.grant", Impl.grant, client, options);
}

export declare namespace grant {
  /** Options for {@link grant}. */
  type Options = {
    /** Account that gets the roles. */
    grantee: string;
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
  /** Errors {@link grant} can fail with. */
  type ErrorType = AnyError;
}

// Explicit types keep these declarations free of Effect types.

/** Builds the plan without sending anything. */
grant.prepare = Action.promiseOf("role.grant.prepare", Impl.grantMethods.prepare) as Write.Method<
  grant.Options,
  Plan
>;

/** Simulates the plan with `eth_call`, reporting each step. */
grant.simulate = Action.promiseOf(
  "role.grant.simulate",
  Impl.grantMethods.simulate,
) as Write.Method<grant.Options, Plan.Simulation>;

/** Estimates the gas and ETH the plan needs. */
grant.estimateGas = Action.promiseOf(
  "role.grant.estimateGas",
  Impl.grantMethods.estimateGas,
) as Write.Method<grant.Options, Plan.Estimate>;

/**
 * Grants ENSv2 roles to an account on a name, or at the root of a registry or resolver. Resolves once the receipt is in.
 *
 * **When to use**
 *
 * Use when the next step depends on the change being on-chain.
 *
 * **Example** (Granting a role and waiting)
 *
 * ```ts
 * const { receipt } = await ens.role.grantSync({ name: "alice.eth", grantee: "0xB0b0000000000000000000000000000000000000", roles: ["renew"], target: "registry" })
 * ```
 *
 * **Example** (Waiting with a standalone call)
 *
 * ```ts
 * import { Actions } from "@ensforge/sdk"
 *
 * await Actions.role.grantSync(ens, { name: "alice.eth", grantee: "0xB0b0000000000000000000000000000000000000", roles: ["renew"], target: "registry" })
 * ```
 *
 * **Example** (Waiting in an Effect program)
 *
 * ```ts
 * import { Actions } from "@ensforge/sdk/effect"
 *
 * yield* Actions.role.grantSync(ens, { name: "alice.eth", grantee: "0xB0b0000000000000000000000000000000000000", roles: ["renew"], target: "registry" })
 * ```
 *
 * @throws `Errors.InvalidInputError` (`INVALID_NAME`, `INVALID_ADDRESS`, `INVALID_ROLES`, `INVALID_RECORD_VALUE`) for invalid input or targets.
 * @throws `Errors.UnsupportedError` (`UNSUPPORTED_PROTOCOL`) for ENSv1 names.
 * @throws `Errors.UnauthorizedError` (`CANNOT_GRANT_ROLES`) without the admin roles.
 * @throws `Errors.InvalidInputError` (`INVALID_ROLES`) when a role already has the maximum of 15 holders.
 * @throws `Errors.TransactionError` (`TRANSACTION_REVERTED`, `RECEIPT_TIMEOUT`) when confirmation fails.
 *
 * @see {@link grant} to resolve on submission
 * @stability stable
 * @category writing
 * @since 1.0.0
 */
export function grantSync(client: Like, options: grantSync.Options): Promise<grantSync.ReturnType> {
  return Action.promise("role.grantSync", Impl.grantSync, client, options);
}

export declare namespace grantSync {
  /** Options for {@link grantSync}. */
  type Options = grant.Options & Write.SyncOptions;
  /** Receipts plus the submitted hashes and plan. */
  type ReturnType = Write.SyncResult;
  /** Errors {@link grantSync} can fail with. */
  type ErrorType = AnyError;
}
