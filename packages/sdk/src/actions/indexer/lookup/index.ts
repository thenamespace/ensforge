import type { Like } from "../../../client/types.js";
import type { AnyError } from "../../../errors/types.js";
import type { Query } from "../../../indexer/Indexer.js";
import type { LookupResult, Result } from "../../../indexer/types.js";
import * as Action from "../../../internal/action/index.js";
import type { Read } from "../../../Types.js";
import * as Impl from "./effect.js";

/**
 * Reads up to 1,000 names and addresses in one request.
 *
 * **When to use**
 *
 * Use to render lists of names or accounts at once, e.g. a feed or a table of holders.
 *
 * **Details**
 *
 * - Each input answers on its own: names with their state, addresses with their primary name and
 *   related names.
 * - An input that fails (an invalid name) reports `status` instead of failing the whole lookup.
 * - `profile: "detail"` adds records and resolution to each answer.
 *
 * **Example** (Reading names and addresses together)
 *
 * ```ts
 * const { results } = await ens.indexer.lookup({ inputs: ["nick.eth", "0xd8dA…"] })
 * ```
 *
 * **Example** (Reading profiles with a standalone call)
 *
 * ```ts
 * import { Actions } from "@ensforge/sdk"
 *
 * const { results } = await Actions.indexer.lookup(ens, { inputs: names, profile: "detail" })
 * ```
 *
 * **Example** (Reading names together in an Effect program)
 *
 * ```ts
 * import { Actions } from "@ensforge/sdk/effect"
 *
 * const { results } = yield* Actions.indexer.lookup(ens, { inputs: ["nick.eth", "ens.eth"] })
 * ```
 *
 * @throws `Errors.InvalidInputError` (`INVALID_RECORD_VALUE`) for more than 1,000 inputs or none.
 * @throws `Errors.ConfigError` (`INDEXER_NOT_CONFIGURED`) when the client has no indexer.
 * @throws `Errors.IndexerError` (`INDEXER_UNSUPPORTED`) when the indexer does not serve the query or its namespace.
 * @throws `Errors.IndexerError` when the indexer is unavailable, rate limiting, behind or answers unexpectedly.
 *
 * @see `Actions.batch` for on-chain reads together
 * @stability stable
 * @category indexer
 * @since 1.0.0
 */
export function lookup(client: Like, options: lookup.Options): Promise<lookup.ReturnType> {
  return Action.promise("indexer.lookup", Impl.lookup, client, options);
}

export declare namespace lookup {
  /** Options for {@link lookup}. */
  type Options = Pick<Read.Options, "signal"> & Query.Lookup;
  /** One answer per input, in input order. */
  type ReturnType = Result<{ readonly results: readonly LookupResult[] }>;
  /** Errors {@link lookup} can fail with. */
  type ErrorType = AnyError;
}

/** Builds a deferred read for `Actions.batch`. */
lookup.request = Action.request("indexer.lookup", Impl.lookup);

/** Path of the action, e.g. for cache keys. */
lookup.path = "indexer.lookup" as const;
