import type { Like } from "../../../client/types.js";
import type * as Errors from "../../../errors/index.js";
import type { Query } from "../../../indexer/Indexer.js";
import type { Namespace, Page, Subname } from "../../../indexer/types.js";
import * as Action from "../../../internal/action/index.js";
import type { Read } from "../../../Types.js";
import * as Impl from "./effect.js";

/**
 * Lists the direct subnames of a name.
 *
 * **When to use**
 *
 * Use to show a name's children, e.g. a subname table with search and sorting.
 *
 * **Details**
 *
 * - Includes expired and released children unless `includeExpired: false`.
 * - `search` matches labels by prefix, or anywhere with `match: "contains"`.
 * - Fails with `NotFoundError` (`INDEXER_NOT_FOUND`) when the indexer has no such parent.
 *
 * **Example** (Listing subnames)
 *
 * ```ts
 * const page = await ens.indexer.getSubnames({ name: "ens.eth" })
 * ```
 *
 * **Example** (Searching subnames with a standalone call)
 *
 * ```ts
 * import { Actions } from "@ensforge/sdk"
 *
 * const page = await Actions.indexer.getSubnames(ens, { name: "ens.eth", search: "dao" })
 * ```
 *
 * **Example** (Listing subnames in an Effect program)
 *
 * ```ts
 * import { Actions } from "@ensforge/sdk/effect"
 *
 * const page = yield* Actions.indexer.getSubnames(ens, { name: "ens.eth", sort: "expiry" })
 * ```
 *
 * @throws `Errors.InvalidInputError` (`INVALID_NAME`) when the name does not normalize.
 * @throws `Errors.NotFoundError` (`INDEXER_NOT_FOUND`) when the indexer has no such name.
 * @throws `Errors.ConfigError` (`INDEXER_NOT_CONFIGURED`) when the client has no indexer.
 * @throws `Errors.IndexerError` (`INDEXER_UNSUPPORTED`) when the indexer does not serve the query or its namespace, or for a Linea Names or Celonames name, which no indexer serves.
 * @throws `Errors.IndexerError` (`INDEXER_UNAVAILABLE`, `INDEXER_RATE_LIMITED`, `INDEXER_BEHIND`, `INDEXER_REQUEST_REJECTED`, `INDEXER_RESPONSE_INVALID`) when the indexer is unavailable, rate limiting, behind, rejects the request or answers unexpectedly.
 *
 * @see `paginate` from `@ensforge/sdk/indexer` to walk every page
 * @stability stable
 * @category indexer
 * @since 1.0.0
 */
export function getSubnames(
  client: Like,
  options: getSubnames.Options,
): Promise<getSubnames.ReturnType> {
  return Action.promise("indexer.getSubnames", Impl.getSubnames, client, options);
}

export declare namespace getSubnames {
  /** Options for {@link getSubnames}. */
  type Options = Pick<Read.Options, "signal"> &
    Omit<Query.GetSubnames, "namespace"> & {
      /**
       * Namespace of the name.
       *
       * @default "basenames" for `*.base.eth`, otherwise "ens"
       */
      namespace?: Namespace | undefined;
    };
  /** One page of subnames. */
  type ReturnType = Page<Subname>;
  /** Errors {@link getSubnames} can fail with. */
  type ErrorType =
    | Errors.CommonError
    | Errors.InvalidInputError
    | Errors.NotFoundError
    | Errors.IndexerError;
}

/** Builds a deferred read for `Actions.batch`. */
getSubnames.request = Action.request(
  "indexer.getSubnames",
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- Action.Declared narrows errors to the documented @throws
  Impl.getSubnames as Action.Declared<typeof Impl.getSubnames, getSubnames.ErrorType>,
);

/** Path of the action, e.g. for cache keys. */
getSubnames.path = "indexer.getSubnames" as const;
