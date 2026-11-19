import type { Like } from "../../../client/types.js";
import type * as Errors from "../../../errors/index.js";
import type { Query } from "../../../indexer/Indexer.js";
import type { IndexedEvent, Namespace, Page } from "../../../indexer/types.js";
import * as Action from "../../../internal/action/index.js";
import type { Read } from "../../../Types.js";
import * as Impl from "./effect.js";

/**
 * Reads the full history of a name, or of every name an address is related to.
 *
 * **When to use**
 *
 * Use to show an activity feed for a name or an account, back to its first event.
 *
 * **Details**
 *
 * - Events use the same `type` and `action` vocabulary as `event.get`, which reads recent events
 *   straight from the chain.
 * - Newest first by default (`order: "asc"` for oldest first); each event carries its details
 *   (`data`) unless `includeData: false`.
 * - `scope` selects the name's own events, its registrations' events, or both (default).
 *
 * **Example** (Reading a name's history)
 *
 * ```ts
 * const page = await ens.indexer.getHistory({ name: "nick.eth" })
 * ```
 *
 * **Example** (Reading an address's history with a standalone call)
 *
 * ```ts
 * import { Actions } from "@ensforge/sdk"
 *
 * const page = await Actions.indexer.getHistory(ens, { address, types: ["transfer"] })
 * ```
 *
 * **Example** (Reading record changes in an Effect program)
 *
 * ```ts
 * import { Actions } from "@ensforge/sdk/effect"
 *
 * const page = yield* Actions.indexer.getHistory(ens, { name: "nick.eth", recordKey: "avatar" })
 * ```
 *
 * @throws `Errors.InvalidInputError` (`INVALID_NAME`, `INVALID_ADDRESS`) for invalid input.
 * @throws `Errors.NotFoundError` (`INDEXER_NOT_FOUND`) when the indexer has no such name.
 * @throws `Errors.ConfigError` (`INDEXER_NOT_CONFIGURED`) when the client has no indexer.
 * @throws `Errors.IndexerError` (`INDEXER_UNSUPPORTED`) when the indexer does not serve the query or its namespace, or for a Linea Names or Celonames name, which no indexer serves.
 * @throws `Errors.IndexerError` (`INDEXER_UNAVAILABLE`, `INDEXER_RATE_LIMITED`, `INDEXER_BEHIND`, `INDEXER_REQUEST_REJECTED`, `INDEXER_RESPONSE_INVALID`) when the indexer is unavailable, rate limiting, behind, rejects the request or answers unexpectedly.
 *
 * @see {@link Actions.event.get} for recent events from the chain
 * @see `paginate` from `@ensforge/sdk/indexer` to walk every page
 * @stability stable
 * @category indexer
 * @since 1.0.0
 */
export function getHistory(
  client: Like,
  options: getHistory.Options,
): Promise<getHistory.ReturnType> {
  return Action.promise("indexer.getHistory", Impl.getHistory, client, options);
}

export declare namespace getHistory {
  /** Options for {@link getHistory}. */
  type Options = Pick<Read.Options, "signal"> &
    Query.HistoryFilters & {
      /** Namespace; inferred from the name, or every namespace for an address. */
      namespace?: Namespace | undefined;
      /** Name events, registration events, or both. @default "both" */
      scope?: "name" | "registration" | "both" | undefined;
    } & (
      | {
          /** The name whose history to read. */
          name: string;
          address?: undefined;
          /** Also the registrations of its children. */
          includeChildRegistrations?: boolean | undefined;
        }
      | {
          /** The address whose names' history to read. */
          address: string;
          name?: undefined;
          /** Relations to follow. @default ["owner", "manager", "roleHolder"] */
          relation?: readonly ("owner" | "manager" | "roleHolder")[] | undefined;
        }
    );
  /** One page of events. */
  type ReturnType = Page<IndexedEvent>;
  /** Errors {@link getHistory} can fail with. */
  type ErrorType =
    | Errors.CommonError
    | Errors.InvalidInputError
    | Errors.NotFoundError
    | Errors.IndexerError;
}

/** Builds a deferred read for `Actions.batch`. */
getHistory.request = Action.request(
  "indexer.getHistory",
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- Action.Declared narrows errors to the documented @throws
  Impl.getHistory as Action.Declared<typeof Impl.getHistory, getHistory.ErrorType>,
);

/** Path of the action, e.g. for cache keys. */
getHistory.path = "indexer.getHistory" as const;
