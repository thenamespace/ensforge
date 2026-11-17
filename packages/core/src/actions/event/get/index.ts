import type { Like } from "../../../client/types.js";
import type { AnyError } from "../../../errors/types.js";
import * as Action from "../../../internal/action/index.js";
import type { Read } from "../../../Types.js";
import type { Event, EventType } from "../types.js";
import * as Impl from "./effect.js";

/**
 * Reads the ENS events of one name over a block range, across ENSv1 and ENSv2.
 *
 * **When to use**
 *
 * Use to show a name's recent activity, or to follow a write's effects, straight from the chain.
 *
 * **Details**
 *
 * - Scans the name's own contracts: the ENSv1 registry, `.eth` registrar and controllers,
 *   NameWrapper, resolver and DNS registrar; the ENSv2 registry holding it (following token
 *   regenerations), the ETHRegistrar, its resolver (record links) and its subregistry.
 * - Ranges the RPC provider rejects are split; past `maxRequests` requests the read fails
 *   with `LOG_RANGE_TOO_LARGE` instead of sending more.
 * - Address-wide and full history needs an indexer (`indexer.getHistory`).
 *
 * **Example** (Reading a name's recent events)
 *
 * ```ts
 * const events = await ens.event.get({ name: "nick.eth", fromBlock: 26_000_000n })
 * ```
 *
 * **Example** (Reading a name's recent events with a standalone call)
 *
 * ```ts
 * import { Actions } from "@ensforge/core"
 *
 * const events = await Actions.event.get(publicClient, { name: "nick.eth", fromBlock: 26_000_000n })
 * ```
 *
 * **Example** (Reading a name's recent events in an Effect program)
 *
 * ```ts
 * import { Actions } from "@ensforge/core/effect"
 *
 * const events = yield* Actions.event.get(ens, { name: "nick.eth", fromBlock: 26_000_000n })
 * ```
 *
 * @throws `Errors.InvalidInputError` (`INVALID_NAME`, `INVALID_RECORD_VALUE`) for invalid input.
 * @throws `Errors.NetworkError` (`LOG_RANGE_TOO_LARGE`) when the provider's log limits make the range too expensive.
 * @throws `Errors.NetworkError` when the RPC request fails.
 *
 * @see {@link Actions.event.watch} to follow new events
 * @stability stable
 * @category reading
 * @since 1.0.0
 */
export function get(client: Like, options: get.Options): Promise<get.ReturnType> {
  return Action.promise("event.get", Impl.get, client, options);
}

export declare namespace get {
  /** Options for {@link get}. */
  type Options = Pick<Read.Options, "signal"> & {
    /** ENS name. Normalized automatically. */
    name: string;
    /** First block, inclusive. */
    fromBlock: bigint;
    /**
     * Last block, inclusive.
     *
     * @default "latest"
     */
    toBlock?: bigint | "latest" | undefined;
    /** Only these event types. */
    types?: readonly EventType[] | undefined;
    /**
     * Most `eth_getLogs` requests to send.
     *
     * @default 500
     */
    maxRequests?: number | undefined;
  };
  /** The name's ENS events, in chain order. */
  type ReturnType = readonly Event[];
  /** Errors {@link get} can fail with. */
  type ErrorType = AnyError;
}

/** Builds a deferred read for `Actions.batch`. */
get.request = Action.request("event.get", Impl.get);
