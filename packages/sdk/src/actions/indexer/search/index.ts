import type { Like } from "../../../client/types.js";
import type * as Errors from "../../../errors/index.js";
import type { Query } from "../../../indexer/Indexer.js";
import type { IndexedName, Page } from "../../../indexer/types.js";
import * as Action from "../../../internal/action/index.js";
import type { Read } from "../../../Types.js";
import * as Impl from "./effect.js";

/**
 * Searches names by text.
 *
 * **When to use**
 *
 * Use to back a name search box or autocomplete.
 *
 * **Details**
 *
 * - Matches from the start of a label by default; `match: "contains"` matches anywhere.
 * - Searches every namespace the indexer serves unless `namespace` is set.
 *
 * **Example** (Searching names)
 *
 * ```ts
 * const page = await ens.indexer.search({ query: "vitalik" })
 * ```
 *
 * **Example** (Searching anywhere in a label with a standalone call)
 *
 * ```ts
 * import { Actions } from "@ensforge/sdk"
 *
 * const page = await Actions.indexer.search(ens, { query: "dao", match: "contains" })
 * ```
 *
 * **Example** (Searching names in an Effect program)
 *
 * ```ts
 * import { Actions } from "@ensforge/sdk/effect"
 *
 * const page = yield* Actions.indexer.search(ens, { query: "nick", limit: 10 })
 * ```
 *
 * @throws `Errors.InvalidInputError` (`INVALID_RECORD_VALUE`) when `query` is empty.
 * @throws `Errors.ConfigError` (`INDEXER_NOT_CONFIGURED`) when the client has no indexer.
 * @throws `Errors.IndexerError` (`INDEXER_UNSUPPORTED`) when the indexer does not serve the query or its namespace.
 * @throws `Errors.IndexerError` when the indexer is unavailable, rate limiting, behind or answers unexpectedly.
 *
 * @stability stable
 * @category indexer
 * @since 1.0.0
 */
export function search(client: Like, options: search.Options): Promise<search.ReturnType> {
  return Action.promise("indexer.search", Impl.search, client, options);
}

export declare namespace search {
  /** Options for {@link search}. */
  type Options = Pick<Read.Options, "signal"> & Query.Search;
  /** One page of matching names. */
  type ReturnType = Page<IndexedName>;
  /** Errors {@link search} can fail with. */
  type ErrorType = Errors.CommonError | Errors.InvalidInputError | Errors.IndexerError;
}

/** Builds a deferred read for `Actions.batch`. */
search.request = Action.request(
  "indexer.search",
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- Action.Declared narrows errors to the documented @throws
  Impl.search as Action.Declared<typeof Impl.search, search.ErrorType>,
);

/** Path of the action, e.g. for cache keys. */
search.path = "indexer.search" as const;
