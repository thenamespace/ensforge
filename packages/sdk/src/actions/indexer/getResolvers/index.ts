import type { Like } from "../../../client/types.js";
import type * as Errors from "../../../errors/index.js";
import type { Query } from "../../../indexer/Indexer.js";
import type { Page, RoleHolderResolver } from "../../../indexer/types.js";
import * as Action from "../../../internal/action/index.js";
import type { Read } from "../../../Types.js";
import * as Impl from "./effect.js";

/**
 * Lists the ENSv2 resolvers on which an address holds roles.
 *
 * **When to use**
 *
 * Use to find every resolver an account can edit, e.g. for a records dashboard.
 *
 * **Details**
 *
 * - bigname v0.14 and later; other indexers, and older bigname servers, fail with
 *   `INDEXER_UNSUPPORTED`, so `fallback()` moves on to the next indexer.
 *
 * **Example** (Listing an account's resolvers)
 *
 * ```ts
 * const page = await ens.indexer.getResolvers({ roleHolder: account })
 * ```
 *
 * **Example** (Listing resolvers with a standalone call)
 *
 * ```ts
 * import { Actions } from "@ensforge/sdk"
 *
 * const page = await Actions.indexer.getResolvers(ens, { roleHolder: account })
 * ```
 *
 * **Example** (Listing resolvers in an Effect program)
 *
 * ```ts
 * import { Actions } from "@ensforge/sdk/effect"
 *
 * const page = yield* Actions.indexer.getResolvers(ens, { roleHolder: account })
 * ```
 *
 * @throws `Errors.InvalidInputError` (`INVALID_ADDRESS`) for an invalid address.
 * @throws `Errors.ConfigError` (`INDEXER_NOT_CONFIGURED`) when the client has no indexer.
 * @throws `Errors.IndexerError` (`INDEXER_UNSUPPORTED`) when the indexer does not serve the query or its namespace.
 * @throws `Errors.IndexerError` (`INDEXER_UNAVAILABLE`, `INDEXER_RATE_LIMITED`, `INDEXER_BEHIND`, `INDEXER_REQUEST_REJECTED`, `INDEXER_RESPONSE_INVALID`) when the indexer is unavailable, rate limiting, behind, rejects the request or answers unexpectedly.
 *
 * @stability stable
 * @category indexer
 * @since 1.0.0
 */
export function getResolvers(
  client: Like,
  options: getResolvers.Options,
): Promise<getResolvers.ReturnType> {
  return Action.promise("indexer.getResolvers", Impl.getResolvers, client, options);
}

export declare namespace getResolvers {
  /** Options for {@link getResolvers}. */
  type Options = Pick<Read.Options, "signal"> &
    Omit<Query.GetResolvers, "roleHolder"> & {
      /** The account holding roles. */
      roleHolder: string;
    };
  /** One page of resolvers. */
  type ReturnType = Page<RoleHolderResolver>;
  /** Errors {@link getResolvers} can fail with. */
  type ErrorType = Errors.CommonError | Errors.InvalidInputError | Errors.IndexerError;
}

/** Builds a deferred read for `Actions.batch`. */
getResolvers.request = Action.request(
  "indexer.getResolvers",
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- Action.Declared narrows errors to the documented @throws
  Impl.getResolvers as Action.Declared<typeof Impl.getResolvers, getResolvers.ErrorType>,
);

/** Path of the action, e.g. for cache keys. */
getResolvers.path = "indexer.getResolvers" as const;
