import type { Log, TransactionReceipt } from "viem";

import type { Like } from "../../../client/types.js";
import type * as Errors from "../../../errors/index.js";
import * as Action from "../../../internal/action/index.js";
import type { Event } from "../types.js";
import * as Impl from "./effect.js";

/**
 * Normalizes the ENS events in logs or transaction receipts.
 *
 * **When to use**
 *
 * Use to read what a write did from its receipts, or to classify logs you fetched yourself.
 *
 * **Details**
 *
 * - Each event carries the indexer's `type` and `action` (bigname's model), the Solidity
 *   event name, protocol, emitter, decoded arguments and, when the event spells it, the name.
 * - Logs that are not ENS events (token transfers, other contracts) are skipped.
 * - No RPC calls.
 *
 * **Example** (Decoding a write's receipts)
 *
 * ```ts
 * const events = await ens.event.decode({ receipts })
 * ```
 *
 * **Example** (Decoding a write's receipts with a standalone call)
 *
 * ```ts
 * import { Actions } from "@ensforge/sdk"
 *
 * const events = await Actions.event.decode(publicClient, { receipts })
 * ```
 *
 * **Example** (Decoding a write's receipts in an Effect program)
 *
 * ```ts
 * import { Actions } from "@ensforge/sdk/effect"
 *
 * const events = yield* Actions.event.decode(ens, { receipts })
 * ```
 *
 * @throws `Errors.InternalError` for malformed logs.
 * @throws `Errors.NetworkError` when the RPC request fails.
 *
 * @see {@link Actions.event.get} to fetch a name's events
 * @stability stable
 * @category reading
 * @since 1.0.0
 */
export function decode(client: Like, options: decode.Options): Promise<decode.ReturnType> {
  return Action.promise("event.decode", Impl.decode, client, options);
}

export declare namespace decode {
  /** Options for {@link decode}. */
  type Options = {
    /** Logs to decode. */
    logs?: readonly Log[] | undefined;
    /** Receipts whose logs to decode. */
    receipts?: readonly TransactionReceipt[] | undefined;
  };
  /** The ENS events, in log order. */
  type ReturnType = readonly Event[];
  /** Errors {@link decode} can fail with. */
  type ErrorType = Errors.CommonError;
}

/** Builds a deferred read for `Actions.batch`. */
decode.request = Action.request(
  "event.decode",
  Impl.decode as Action.Declared<typeof Impl.decode, decode.ErrorType>,
);

/** Path of the action, e.g. for cache keys. */
decode.path = "event.decode" as const;
