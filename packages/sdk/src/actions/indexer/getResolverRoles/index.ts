import type { Like } from "../../../client/types.js";
import type { AnyError } from "../../../errors/types.js";
import type { Query } from "../../../indexer/Indexer.js";
import type { Page, ResolverRole } from "../../../indexer/types.js";
import * as Action from "../../../internal/action/index.js";
import type { Read } from "../../../Types.js";
import * as Impl from "./effect.js";

/**
 * Lists the role grants on an ENSv2 resolver.
 *
 * **When to use**
 *
 * Use to audit who can edit the records a resolver holds.
 *
 * **Details**
 *
 * - Powers use the indexer's vocabulary (`set_text`, `admin_set_addr`, …).
 *
 * **Example** (Listing a resolver's roles)
 *
 * ```ts
 * const page = await ens.indexer.getResolverRoles({ address: "0xF4f1…" })
 * ```
 *
 * **Example** (Listing roles with a standalone call)
 *
 * ```ts
 * import { Actions } from "@ensforge/sdk"
 *
 * const page = await Actions.indexer.getResolverRoles(ens, { address })
 * ```
 *
 * **Example** (Listing roles in an Effect program)
 *
 * ```ts
 * import { Actions } from "@ensforge/sdk/effect"
 *
 * const page = yield* Actions.indexer.getResolverRoles(ens, { address })
 * ```
 *
 * @throws `Errors.InvalidInputError` (`INVALID_ADDRESS`) for an invalid address.
 * @throws `Errors.ConfigError` (`INDEXER_NOT_CONFIGURED`) when the client has no indexer.
 * @throws `Errors.IndexerError` (`INDEXER_UNSUPPORTED`) when the indexer does not serve the query or its namespace.
 * @throws `Errors.IndexerError` when the indexer is unavailable, rate limiting, behind or answers unexpectedly.
 *
 * @see {@link Actions.role.get} for the on-chain read
 * @stability stable
 * @category indexer
 * @since 1.0.0
 */
export function getResolverRoles(
  client: Like,
  options: getResolverRoles.Options,
): Promise<getResolverRoles.ReturnType> {
  return Action.promise("indexer.getResolverRoles", Impl.getResolverRoles, client, options);
}

export declare namespace getResolverRoles {
  /** Options for {@link getResolverRoles}. */
  type Options = Pick<Read.Options, "signal"> &
    Query.Snapshot &
    Query.List & {
      /** Contract address. */
      address: string;
      /** Chain of the contract. @default the client's chain */
      chainId?: number | undefined;
    };
  /** One page of grants. */
  type ReturnType = Page<ResolverRole>;
  /** Errors {@link getResolverRoles} can fail with. */
  type ErrorType = AnyError;
}

/** Builds a deferred read for `Actions.batch`. */
getResolverRoles.request = Action.request("indexer.getResolverRoles", Impl.getResolverRoles);

/** Path of the action, e.g. for cache keys. */
getResolverRoles.path = "indexer.getResolverRoles" as const;
