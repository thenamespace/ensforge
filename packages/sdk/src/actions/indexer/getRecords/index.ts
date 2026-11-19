import type { Like } from "../../../client/types.js";
import type * as Errors from "../../../errors/index.js";
import type { Query } from "../../../indexer/Indexer.js";
import type { IndexedRecords, Namespace, Result } from "../../../indexer/types.js";
import * as Action from "../../../internal/action/index.js";
import type { Read } from "../../../Types.js";
import * as Impl from "./effect.js";

/**
 * Reads a name's records and its record inventory from the indexer.
 *
 * **When to use**
 *
 * Use to show a profile, or to learn every record key a name has ever set (the inventory).
 *
 * **Details**
 *
 * - Without `keys`, reads the keys in the name's inventory; `values: false` returns only the
 *   inventory.
 * - Keys are record keys: `avatar` (a text key), `text:url`, `addr:60` or `contenthash`.
 * - `source: "verified"` reads the values on-chain through the indexer; `auto` falls back to it.
 * - `resolver` reads the records the name has on another resolver (e.g. its ENSv1 resolver).
 *
 * **Example** (Reading a profile)
 *
 * ```ts
 * const records = await ens.indexer.getRecords({ name: "nick.eth" })
 * ```
 *
 * **Example** (Reading the inventory with a standalone call)
 *
 * ```ts
 * import { Actions } from "@ensforge/sdk"
 *
 * const records = await Actions.indexer.getRecords(ens, { name: "nick.eth", values: false })
 * const keys = records?.inventory?.keys ?? []
 * ```
 *
 * **Example** (Reading chosen records in an Effect program)
 *
 * ```ts
 * import { Actions } from "@ensforge/sdk/effect"
 *
 * const records = yield* Actions.indexer.getRecords(ens, { name: "nick.eth", keys: ["avatar", "addr:60"] })
 * ```
 *
 * @throws `Errors.InvalidInputError` (`INVALID_NAME`, `INVALID_ADDRESS`) for invalid input.
 * @throws `Errors.NotFoundError` (`INDEXER_NOT_FOUND`) with `strict: true` when the indexer has no such name.
 * @throws `Errors.ConfigError` (`INDEXER_NOT_CONFIGURED`) when the client has no indexer.
 * @throws `Errors.IndexerError` (`INDEXER_UNSUPPORTED`) when the indexer does not serve the query or its namespace, or for a Linea Names or Celonames name, which no indexer serves.
 * @throws `Errors.IndexerError` (`INDEXER_UNAVAILABLE`, `INDEXER_RATE_LIMITED`, `INDEXER_BEHIND`, `INDEXER_REQUEST_REJECTED`, `INDEXER_RESPONSE_INVALID`) when the indexer is unavailable, rate limiting, behind, rejects the request or answers unexpectedly.
 *
 * @see {@link Actions.record.get} for the on-chain read
 * @stability stable
 * @category indexer
 * @since 1.0.0
 */
export function getRecords(
  client: Like,
  options: getRecords.Options,
): Promise<getRecords.ReturnType> {
  return Action.promise("indexer.getRecords", Impl.getRecords, client, options);
}

export declare namespace getRecords {
  /** Options for {@link getRecords}. */
  type Options = Pick<Read.Options, "signal" | "strict"> &
    Omit<Query.GetRecords, "namespace" | "resolver"> & {
      /**
       * Namespace of the name.
       *
       * @default "basenames" for `*.base.eth`, otherwise "ens"
       */
      namespace?: Namespace | undefined;
      /** Read from this resolver (on the client's chain unless `chainId` is set). */
      resolver?: { readonly address: string; readonly chainId?: number | undefined } | undefined;
    };
  /** The records, or `null` when the indexer does not know the name. */
  type ReturnType = Result<IndexedRecords> | null;
  /** Errors {@link getRecords} can fail with. */
  type ErrorType =
    | Errors.CommonError
    | Errors.InvalidInputError
    | Errors.NotFoundError
    | Errors.IndexerError;
}

/** Builds a deferred read for `Actions.batch`. */
getRecords.request = Action.request(
  "indexer.getRecords",
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- Action.Declared narrows errors to the documented @throws
  Impl.getRecords as Action.Declared<typeof Impl.getRecords, getRecords.ErrorType>,
);

/** Path of the action, e.g. for cache keys. */
getRecords.path = "indexer.getRecords" as const;
