import type { Like } from "../../../client/types.js";
import type { AnyError } from "../../../errors/types.js";
import type { Query } from "../../../indexer/Indexer.js";
import type { Namespace, Page, PermissionRow } from "../../../indexer/types.js";
import * as Action from "../../../internal/action/index.js";
import type { Read } from "../../../Types.js";
import * as Impl from "./effect.js";

/**
 * Lists who can do what over a name, a registration, an account or an ENSv2 registry.
 *
 * **When to use**
 *
 * Use to show a name's permission table, or every grant an account holds.
 *
 * **Details**
 *
 * - Pass exactly one of `name`, `registrationId`, `address` or `registry`.
 * - Powers use the indexer's vocabulary (`set_resolver`, `admin_renew`, …); `includeLineage`
 *   explains how each was obtained.
 * - Surfaces the indexer cannot list (e.g. operator approvals) are reported through
 *   `completeness` and `unsupportedReason`.
 *
 * **Example** (Listing a name's permissions)
 *
 * ```ts
 * const page = await ens.indexer.getPermissions({ name: "nick.eth" })
 * ```
 *
 * **Example** (Listing an account's grants with a standalone call)
 *
 * ```ts
 * import { Actions } from "@ensforge/core"
 *
 * const page = await Actions.indexer.getPermissions(ens, { address })
 * ```
 *
 * **Example** (Listing a registry's root grants in an Effect program)
 *
 * ```ts
 * import { Actions } from "@ensforge/core/effect"
 *
 * const page = yield* Actions.indexer.getPermissions(ens, { registry: { address: registry } })
 * ```
 *
 * @throws `Errors.InvalidInputError` (`INVALID_NAME`, `INVALID_ADDRESS`, `INVALID_RECORD_VALUE`) for invalid input.
 * @throws `Errors.ConfigError` (`INDEXER_NOT_CONFIGURED`) when the client has no indexer.
 * @throws `Errors.IndexerError` (`INDEXER_UNSUPPORTED`) when the indexer does not serve the query or its namespace.
 * @throws `Errors.IndexerError` when the indexer is unavailable, rate limiting, behind or answers unexpectedly.
 *
 * @see {@link Actions.permission.get} for the on-chain check
 * @stability stable
 * @category indexer
 * @since 1.0.0
 */
export function getPermissions(
  client: Like,
  options: getPermissions.Options,
): Promise<getPermissions.ReturnType> {
  return Action.promise("indexer.getPermissions", Impl.getPermissions, client, options);
}

export declare namespace getPermissions {
  /** Options for {@link getPermissions}. */
  type Options = Pick<Read.Options, "signal"> &
    Query.List & {
      /** Only grants in this namespace. */
      namespace?: Namespace | undefined;
      /** Include how each grant was obtained. */
      includeLineage?: boolean | undefined;
      /** Permissions over this name. */
      name?: string | undefined;
      /** Permissions over this registration (an indexer handle). */
      registrationId?: string | undefined;
      /** Grants this account holds. */
      address?: string | undefined;
      /** Root grants of this ENSv2 registry (on the client's chain unless `chainId` is set). */
      registry?: { readonly address: string; readonly chainId?: number | undefined } | undefined;
    };
  /** One page of grants. */
  type ReturnType = Page<PermissionRow>;
  /** Errors {@link getPermissions} can fail with. */
  type ErrorType = AnyError;
}

/** Builds a deferred read for `Actions.batch`. */
getPermissions.request = Action.request("indexer.getPermissions", Impl.getPermissions);
