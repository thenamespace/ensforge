import type { Address } from "viem";

import type { Like } from "../../../client/types.js";
import type * as Errors from "../../../errors/index.js";
import * as Action from "../../../internal/action/index.js";
import type { Read } from "../../../Types.js";
import type * as Role from "../../../utils/Role.js";
import * as Impl from "./effect.js";

/**
 * Reads the ENSv2 roles an account holds on a name, or at the root of a registry or resolver.
 *
 * **When to use**
 *
 * Use to inspect EnhancedAccessControl roles directly; {@link Actions.permission.get} answers
 * the higher-level question of what the account may do.
 *
 * **Details**
 *
 * - `target: "registry"` reads roles on the name in the registry holding it (or the root with
 *   `root: true`); `"resolver"` reads root roles on the name's PermissionedResolver.
 * - Root roles apply to every name, so `roles` includes them; `rootRoles` shows them alone.
 * - `contract` reads another registry or resolver than the name's.
 *
 * **Example** (Reading an account's roles on a name)
 *
 * ```ts
 * const { names } = await ens.role.get({ name: "alice.eth", account, target: "registry" })
 * ```
 *
 * **Example** (Root roles on a resolver with a standalone call)
 *
 * ```ts
 * import { Actions } from "@ensforge/sdk"
 *
 * const roles = await Actions.role.get(publicClient, { name: "alice.eth", account, target: "resolver", root: true })
 * ```
 *
 * **Example** (Reading in an Effect program)
 *
 * ```ts
 * import { Actions } from "@ensforge/sdk/effect"
 *
 * const roles = yield* Actions.role.get(ens, { name: "alice.eth", account, target: "registry" })
 * ```
 *
 * @throws `Errors.InvalidInputError` (`INVALID_NAME`, `INVALID_ADDRESS`, `INVALID_RECORD_VALUE`) for invalid input or targets.
 * @throws `Errors.NotFoundError` (`RESOLVER_NOT_FOUND`) when the name has no resolver.
 * @throws `Errors.UnsupportedError` (`UNSUPPORTED_PROTOCOL`) for ENSv1 names.
 * @throws `Errors.NetworkError` when the RPC request fails.
 *
 * @see {@link Actions.role.grant} to grant roles
 * @stability stable
 * @category reading
 * @since 1.0.0
 */
export function get(client: Like, options: get.Options): Promise<get.ReturnType> {
  return Action.promise("role.get", Impl.get, client, options);
}

export declare namespace get {
  /** Options for {@link get}. */
  type Options = Pick<Read.Options, "signal"> &
    Read.BlockOptions & {
      /** Account whose roles to read. */
      account: string;
      /** Registry or PermissionedResolver roles. */
      target: "registry" | "resolver";
      /** ENS name whose registry or resolver to use. Normalized automatically. */
      name?: string | undefined;
      /** Registry or resolver address, instead of the name's. */
      contract?: string | undefined;
      /** Read root roles instead of the name's. */
      root?: boolean | undefined;
    };
  /** The roles held, as a bitmap and as role names. */
  type ReturnType = {
    readonly contract: Address;
    /** EAC resource read; `0n` is the root. */
    readonly resource: bigint;
    readonly roles: bigint;
    readonly rootRoles: bigint;
    readonly names: readonly Role.Name[];
    /** Admin roles: the account may grant and revoke these roles. */
    readonly admin: readonly Role.Name[];
  };
  /** Errors {@link get} can fail with. */
  type ErrorType =
    | Errors.CommonError
    | Errors.InvalidInputError
    | Errors.NotFoundError
    | Errors.UnsupportedError;
}

/** Builds a deferred read for `Actions.batch`. */
get.request = Action.request(
  "role.get",
  Impl.get as Action.Declared<typeof Impl.get, get.ErrorType>,
);

/** Path of the action, e.g. for cache keys. */
get.path = "role.get" as const;
