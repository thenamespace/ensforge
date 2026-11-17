import type { Like } from "../../../client/types.js";
import type { AnyError } from "../../../errors/types.js";
import type { Query } from "../../../indexer/Indexer.js";
import type { IndexedResolver, Result } from "../../../indexer/types.js";
import * as Action from "../../../internal/action/index.js";
import type { Read } from "../../../Types.js";
import * as Impl from "./effect.js";

/**
 * Reads a resolver and one page of the names bound to it.
 *
 * **When to use**
 *
 * Use to see which names use a resolver before changing or replacing it.
 *
 * **Details**
 *
 * - Bound names are paged: pass the answer's `cursor` for more.
 * - ENSv1 compatibility resolvers report the registry they mirror (`mirrors`).
 *
 * **Example** (Reading a resolver)
 *
 * ```ts
 * const resolver = await ens.indexer.getResolver({ address: "0xF4f1…" })
 * ```
 *
 * **Example** (Reading a resolver with a standalone call)
 *
 * ```ts
 * import { Actions } from "@ensforge/sdk"
 *
 * const resolver = await Actions.indexer.getResolver(ens, { address, limit: 200 })
 * ```
 *
 * **Example** (Reading a resolver in an Effect program)
 *
 * ```ts
 * import { Actions } from "@ensforge/sdk/effect"
 *
 * const resolver = yield* Actions.indexer.getResolver(ens, { address })
 * ```
 *
 * @throws `Errors.InvalidInputError` (`INVALID_ADDRESS`) for an invalid address.
 * @throws `Errors.NotFoundError` (`INDEXER_NOT_FOUND`) with `strict: true` when the indexer does not know the contract.
 * @throws `Errors.ConfigError` (`INDEXER_NOT_CONFIGURED`) when the client has no indexer.
 * @throws `Errors.IndexerError` (`INDEXER_UNSUPPORTED`) when the indexer does not serve the query or its namespace.
 * @throws `Errors.IndexerError` when the indexer is unavailable, rate limiting, behind or answers unexpectedly.
 *
 * @see {@link Actions.resolver.get} for the on-chain read
 * @stability stable
 * @category indexer
 * @since 1.0.0
 */
export function getResolver(
  client: Like,
  options: getResolver.Options,
): Promise<getResolver.ReturnType> {
  return Action.promise("indexer.getResolver", Impl.getResolver, client, options);
}

export declare namespace getResolver {
  /** Options for {@link getResolver}. */
  type Options = Pick<Read.Options, "signal" | "strict"> &
    Query.Snapshot &
    Query.List & {
      /** Contract address. */
      address: string;
      /** Chain of the contract. @default the client's chain */
      chainId?: number | undefined;
    };
  /** The resolver, or `null` when the indexer does not know it. */
  type ReturnType = Result<IndexedResolver> | null;
  /** Errors {@link getResolver} can fail with. */
  type ErrorType = AnyError;
}

/** Builds a deferred read for `Actions.batch`. */
getResolver.request = Action.request("indexer.getResolver", Impl.getResolver);
