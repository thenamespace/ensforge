import type { Like } from "../../../client/types.js";
import type { AnyError } from "../../../errors/types.js";
import type { Query } from "../../../indexer/Indexer.js";
import type { AddressName, Page } from "../../../indexer/types.js";
import * as Action from "../../../internal/action/index.js";
import type { Read } from "../../../Types.js";
import type * as CoinType from "../../../utils/CoinType.js";
import * as Impl from "./effect.js";

/**
 * Lists the names an address owns, manages, holds roles on, resolves to, or used to own.
 *
 * **When to use**
 *
 * Use to show an account's names, e.g. a "my names" page or a name picker.
 *
 * **Details**
 *
 * - `relation` defaults to `any`: owner, manager and role holder. `resolvesTo` (with `coin`) and
 *   `formerOwner` are listed on their own.
 * - Lists every namespace the indexer serves unless `namespace` is set.
 * - Pages hold up to `limit` names (default 50, at most 200); pass `cursor` for the next page, or
 *   use `paginate`.
 *
 * **Example** (Listing an address's names)
 *
 * ```ts
 * const page = await ens.indexer.getNamesForAddress({ address: "0xb8c2…" })
 * ```
 *
 * **Example** (Listing names that resolve to an address with a standalone call)
 *
 * ```ts
 * import { Actions } from "@ensforge/core"
 *
 * const page = await Actions.indexer.getNamesForAddress(ens, { address, relation: "resolvesTo" })
 * ```
 *
 * **Example** (Listing an address's names in an Effect program)
 *
 * ```ts
 * import { Actions } from "@ensforge/core/effect"
 *
 * const page = yield* Actions.indexer.getNamesForAddress(ens, { address, sort: "expiry" })
 * ```
 *
 * @throws `Errors.InvalidInputError` (`INVALID_ADDRESS`, `INVALID_COIN_TYPE`, `INVALID_NAME`) for invalid input.
 * @throws `Errors.ConfigError` (`INDEXER_NOT_CONFIGURED`) when the client has no indexer.
 * @throws `Errors.IndexerError` (`INDEXER_UNSUPPORTED`) when the indexer does not serve the query or its namespace.
 * @throws `Errors.IndexerError` when the indexer is unavailable, rate limiting, behind or answers unexpectedly.
 *
 * @see `paginate` from `@ensforge/core/indexer` to walk every page
 * @stability stable
 * @category indexer
 * @since 1.0.0
 */
export function getNamesForAddress(
  client: Like,
  options: getNamesForAddress.Options,
): Promise<getNamesForAddress.ReturnType> {
  return Action.promise("indexer.getNamesForAddress", Impl.getNamesForAddress, client, options);
}

export declare namespace getNamesForAddress {
  /** Options for {@link getNamesForAddress}. */
  type Options = Pick<Read.Options, "signal"> &
    Omit<Query.GetNamesForAddress, "address" | "coinType" | "parent"> & {
      /** The address, all lowercase or checksummed. */
      address: string;
      /** Coin type for `relation: "resolvesTo"`, or `evm` for every EVM chain. @default 60 */
      coin?: CoinType.Input | "evm" | undefined;
      /** Only direct children of this name. */
      parent?: string | undefined;
    };
  /** One page of names, each with how the address relates to it. */
  type ReturnType = Page<AddressName>;
  /** Errors {@link getNamesForAddress} can fail with. */
  type ErrorType = AnyError;
}

/** Builds a deferred read for `Actions.batch`. */
getNamesForAddress.request = Action.request("indexer.getNamesForAddress", Impl.getNamesForAddress);
