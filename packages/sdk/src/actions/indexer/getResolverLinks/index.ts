import type { Like } from "../../../client/types.js";
import type { AnyError } from "../../../errors/types.js";
import type { Query } from "../../../indexer/Indexer.js";
import type { Page, ResolverLink } from "../../../indexer/types.js";
import * as Action from "../../../internal/action/index.js";
import type { Read } from "../../../Types.js";
import * as Impl from "./effect.js";

/**
 * Lists the names linked to record sets on an ENSv2 resolver.
 *
 * **When to use**
 *
 * Use to see which names share a resolver's record sets, e.g. after `record.clear` relinked one.
 *
 * **Details**
 *
 * - Each link says whether it is the resolver's default record set (`isDefault`).
 *
 * **Example** (Listing a resolver's links)
 *
 * ```ts
 * const page = await ens.indexer.getResolverLinks({ address: "0xF4f1…" })
 * ```
 *
 * **Example** (Listing links with a standalone call)
 *
 * ```ts
 * import { Actions } from "@ensforge/sdk"
 *
 * const page = await Actions.indexer.getResolverLinks(ens, { address })
 * ```
 *
 * **Example** (Listing links in an Effect program)
 *
 * ```ts
 * import { Actions } from "@ensforge/sdk/effect"
 *
 * const page = yield* Actions.indexer.getResolverLinks(ens, { address, limit: 100 })
 * ```
 *
 * @throws `Errors.InvalidInputError` (`INVALID_ADDRESS`) for an invalid address.
 * @throws `Errors.ConfigError` (`INDEXER_NOT_CONFIGURED`) when the client has no indexer.
 * @throws `Errors.IndexerError` (`INDEXER_UNSUPPORTED`) when the indexer does not serve the query or its namespace.
 * @throws `Errors.IndexerError` when the indexer is unavailable, rate limiting, behind or answers unexpectedly.
 *
 * @stability stable
 * @category indexer
 * @since 1.0.0
 */
export function getResolverLinks(
  client: Like,
  options: getResolverLinks.Options,
): Promise<getResolverLinks.ReturnType> {
  return Action.promise("indexer.getResolverLinks", Impl.getResolverLinks, client, options);
}

export declare namespace getResolverLinks {
  /** Options for {@link getResolverLinks}. */
  type Options = Pick<Read.Options, "signal"> &
    Query.Snapshot &
    Query.List & {
      /** Contract address. */
      address: string;
      /** Chain of the contract. @default the client's chain */
      chainId?: number | undefined;
    };
  /** One page of links. */
  type ReturnType = Page<ResolverLink>;
  /** Errors {@link getResolverLinks} can fail with. */
  type ErrorType = AnyError;
}

/** Builds a deferred read for `Actions.batch`. */
getResolverLinks.request = Action.request("indexer.getResolverLinks", Impl.getResolverLinks);
