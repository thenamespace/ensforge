import type { Like } from "../../../client/types.js";
import type { AnyError } from "../../../errors/types.js";
import * as Action from "../../../internal/action/index.js";
import type { Event, EventType } from "../types.js";
import * as Impl from "./effect.js";

/**
 * Watches one name's ENS events as new blocks arrive. Resolves to a function that stops watching.
 *
 * **When to use**
 *
 * Use to update a name's page live, or to react when another account changes the name.
 *
 * **Details**
 *
 * - Every new block range is read like {@link Actions.event.get}, so resolver and registry
 *   changes during the watch are followed.
 * - Polls at the public client's `pollingInterval` unless `pollingInterval` is given.
 *
 * **Example** (Watching a name)
 *
 * ```ts
 * const unwatch = await ens.event.watch({ name: "nick.eth", onEvents: (events) => console.log(events) })
 * ```
 *
 * **Example** (Watching with a standalone call)
 *
 * ```ts
 * import { Actions } from "@ensforge/core"
 *
 * const unwatch = await Actions.event.watch(publicClient, { name: "nick.eth", onEvents })
 * ```
 *
 * **Example** (Watching in an Effect program)
 *
 * ```ts
 * import { Actions } from "@ensforge/core/effect"
 *
 * const unwatch = yield* Actions.event.watch(ens, { name: "nick.eth", onEvents })
 * ```
 *
 * @throws `Errors.InvalidInputError` (`INVALID_NAME`) for invalid names.
 *
 * @see {@link Actions.event.get} to read past events
 * @stability stable
 * @category reading
 * @since 1.0.0
 */
export function watch(client: Like, options: watch.Options): Promise<watch.ReturnType> {
  return Action.promise("event.watch", Impl.watch, client, options);
}

export declare namespace watch {
  /** Options for {@link watch}. */
  type Options = {
    /** ENS name. Normalized automatically. */
    name: string;
    /** Only these event types. */
    types?: readonly EventType[] | undefined;
    /** Milliseconds between polls. */
    pollingInterval?: number | undefined;
    /** Called with each new batch of events. */
    onEvents: (events: readonly Event[]) => void;
    /** Called when a poll fails; watching continues. */
    onError?: ((error: AnyError) => void) | undefined;
  };
  /** Stops watching. */
  type ReturnType = () => void;
  /** Errors {@link watch} can fail with. */
  type ErrorType = AnyError;
}
