import type { Like } from "../../../client/types.js";
import type * as Errors from "../../../errors/index.js";
import type { Query } from "../../../indexer/Indexer.js";
import type { IndexedEvent, Page } from "../../../indexer/types.js";
import * as Action from "../../../internal/action/index.js";
import type { Read } from "../../../Types.js";
import * as Impl from "./effect.js";

/**
 * Searches indexed ENS events by name, address, resolver, contract or block range.
 *
 * **When to use**
 *
 * Use to audit events across names, e.g. every event a resolver emitted or a block range.
 *
 * **Details**
 *
 * - Filters combine; without any, the newest events of every name are listed.
 * - Same event vocabulary as `event.get` and `indexer.getHistory`.
 *
 * **Example** (Reading a resolver's events)
 *
 * ```ts
 * const page = await ens.indexer.getEvents({ resolver: { address: "0x231b…" } })
 * ```
 *
 * **Example** (Reading a block range with a standalone call)
 *
 * ```ts
 * import { Actions } from "@ensforge/sdk"
 *
 * const page = await Actions.indexer.getEvents(ens, { fromBlock: 26_000_000n, toBlock: 26_000_100n })
 * ```
 *
 * **Example** (Reading registrations in an Effect program)
 *
 * ```ts
 * import { Actions } from "@ensforge/sdk/effect"
 *
 * const page = yield* Actions.indexer.getEvents(ens, { types: ["registration"], order: "desc" })
 * ```
 *
 * @throws `Errors.InvalidInputError` (`INVALID_NAME`, `INVALID_ADDRESS`) for invalid input.
 * @throws `Errors.ConfigError` (`INDEXER_NOT_CONFIGURED`) when the client has no indexer.
 * @throws `Errors.IndexerError` (`INDEXER_UNSUPPORTED`) when the indexer does not serve the query or its namespace.
 * @throws `Errors.IndexerError` (`INDEXER_UNAVAILABLE`, `INDEXER_RATE_LIMITED`, `INDEXER_BEHIND`, `INDEXER_REQUEST_REJECTED`, `INDEXER_RESPONSE_INVALID`) when the indexer is unavailable, rate limiting, behind, rejects the request or answers unexpectedly.
 *
 * @see {@link Actions.indexer.getHistory} for one name or address
 * @stability stable
 * @category indexer
 * @since 1.0.0
 */
export function getEvents(client: Like, options: getEvents.Options): Promise<getEvents.ReturnType> {
  return Action.promise("indexer.getEvents", Impl.getEvents, client, options);
}

export declare namespace getEvents {
  /** Options for {@link getEvents}. */
  type Options = Pick<Read.Options, "signal"> &
    Omit<Query.GetEvents, "name" | "address" | "resolver" | "contract"> & {
      /** Only events of this name. */
      name?: string | undefined;
      /** Only events involving this address. */
      address?: string | undefined;
      /** Only events of this resolver (on the client's chain unless `chainId` is set). */
      resolver?: { readonly address: string; readonly chainId?: number | undefined } | undefined;
      /** Only events emitted by this contract. */
      contract?: string | undefined;
    };
  /** One page of events. */
  type ReturnType = Page<IndexedEvent>;
  /** Errors {@link getEvents} can fail with. */
  type ErrorType = Errors.CommonError | Errors.InvalidInputError | Errors.IndexerError;
}

/** Builds a deferred read for `Actions.batch`. */
getEvents.request = Action.request(
  "indexer.getEvents",
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- Action.Declared narrows errors to the documented @throws
  Impl.getEvents as Action.Declared<typeof Impl.getEvents, getEvents.ErrorType>,
);

/** Path of the action, e.g. for cache keys. */
getEvents.path = "indexer.getEvents" as const;
