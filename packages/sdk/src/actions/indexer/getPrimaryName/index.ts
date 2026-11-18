import type { Like } from "../../../client/types.js";
import type * as Errors from "../../../errors/index.js";
import type { Query } from "../../../indexer/Indexer.js";
import type { IndexedPrimaryName, Result } from "../../../indexer/types.js";
import * as Action from "../../../internal/action/index.js";
import type { Read } from "../../../Types.js";
import type * as CoinType from "../../../utils/CoinType.js";
import * as Impl from "./effect.js";

/**
 * Reads an address's primary name from the indexer, verified on-chain when the indexer can.
 *
 * **When to use**
 *
 * Use to label many accounts quickly; for an authoritative read, use `primaryName.get`.
 *
 * **Details**
 *
 * - `name` is the verified answer when there is one, otherwise the indexed one; `source` says
 *   which.
 * - Every answer the indexer gave is in `answers`, with its status.
 *
 * **Example** (Reading a primary name)
 *
 * ```ts
 * const { name } = await ens.indexer.getPrimaryName({ address: "0xb8c2…" })
 * ```
 *
 * **Example** (Reading a Base primary name with a standalone call)
 *
 * ```ts
 * import { Actions } from "@ensforge/sdk"
 *
 * const result = await Actions.indexer.getPrimaryName(ens, { address, coin: { chainId: 8453 } })
 * ```
 *
 * **Example** (Reading a primary name in an Effect program)
 *
 * ```ts
 * import { Actions } from "@ensforge/sdk/effect"
 *
 * const { name } = yield* Actions.indexer.getPrimaryName(ens, { address })
 * ```
 *
 * @throws `Errors.InvalidInputError` (`INVALID_ADDRESS`, `INVALID_COIN_TYPE`) for invalid input.
 * @throws `Errors.ConfigError` (`INDEXER_NOT_CONFIGURED`) when the client has no indexer.
 * @throws `Errors.IndexerError` (`INDEXER_UNSUPPORTED`) when the indexer does not serve the query or its namespace.
 * @throws `Errors.IndexerError` (`INDEXER_UNAVAILABLE`, `INDEXER_RATE_LIMITED`, `INDEXER_BEHIND`, `INDEXER_REQUEST_REJECTED`, `INDEXER_RESPONSE_INVALID`) when the indexer is unavailable, rate limiting, behind, rejects the request or answers unexpectedly.
 *
 * @see {@link Actions.primaryName.get} for the on-chain read
 * @stability stable
 * @category indexer
 * @since 1.0.0
 */
export function getPrimaryName(
  client: Like,
  options: getPrimaryName.Options,
): Promise<getPrimaryName.ReturnType> {
  return Action.promise("indexer.getPrimaryName", Impl.getPrimaryName, client, options);
}

export declare namespace getPrimaryName {
  /** Options for {@link getPrimaryName}. */
  type Options = Pick<Read.Options, "signal"> &
    Omit<Query.GetPrimaryName, "address" | "coinType"> & {
      /** The address, all lowercase or checksummed. */
      address: string;
      /** Chain of the primary name, as a coin type. @default 60 (Ethereum) */
      coin?: CoinType.Input | undefined;
    };
  /** The primary name (`null` when none) and every answer. */
  type ReturnType = Result<IndexedPrimaryName>;
  /** Errors {@link getPrimaryName} can fail with. */
  type ErrorType = Errors.CommonError | Errors.InvalidInputError | Errors.IndexerError;
}

/** Builds a deferred read for `Actions.batch`. */
getPrimaryName.request = Action.request(
  "indexer.getPrimaryName",
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- Action.Declared narrows errors to the documented @throws
  Impl.getPrimaryName as Action.Declared<typeof Impl.getPrimaryName, getPrimaryName.ErrorType>,
);

/** Path of the action, e.g. for cache keys. */
getPrimaryName.path = "indexer.getPrimaryName" as const;
