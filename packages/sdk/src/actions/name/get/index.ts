import type { Like } from "../../../client/types.js";
import type { AnyError } from "../../../errors/types.js";
import * as Action from "../../../internal/action/index.js";
import type { Read } from "../../../Types.js";
import * as Impl from "./effect.js";
import type { NameState } from "./types.js";

export type { NameKind, NameState, NameStatus } from "./types.js";

/**
 * Reads the full state of a name across ENSv1 and ENSv2: where it lives, who owns it, its
 * resolver, expiry and whether it can be registered or renewed.
 *
 * **When to use**
 *
 * Use when a UI needs to know about a name: owner, expiry, grace period, availability, or
 * which protocol to send writes to.
 *
 * **Details**
 *
 * - `kind` tells where the name lives (`v1-unwrapped`, `v1-wrapped`, `v2-native`, `v2-migrated`,
 *   `v2-reserved`, `available`); `protocol` is `v1` or `v2`.
 * - Times come from the block the read runs at, not the local clock.
 * - Costs two batched RPC calls, whatever the name kind.
 *
 * **Gotchas**
 *
 * - `resolver` is the resolver set on the name itself. A name served by a parent's wildcard
 *   resolver has `resolver: null`; use `resolver.get` for the effective resolver.
 *
 * **Example** (Showing a renewal banner)
 *
 * ```ts
 * const state = await ens.name.get({ name: "alice.eth" })
 * if (state.status === "grace") showRenewBanner(state.gracePeriodEnd)
 * ```
 *
 * **Example** (Reading with a bare viem client)
 *
 * ```ts
 * import { Actions } from "@ensforge/sdk"
 *
 * const { owner, expiry } = await Actions.name.get(publicClient, { name: "nick.eth" })
 * ```
 *
 * **Example** (Reading in an Effect program)
 *
 * ```ts
 * import { Actions } from "@ensforge/sdk/effect"
 *
 * const state = yield* Actions.name.get(ens, { name: "nick.eth" })
 * ```
 *
 * @throws `Errors.InvalidInputError` (`INVALID_NAME`) when the name is invalid or the root.
 * @throws `Errors.NetworkError` when the RPC request fails.
 *
 * @see {@link Actions.name.transfer} to send a name
 * @stability stable
 * @category reading
 * @since 1.0.0
 */
export function get(client: Like, options: get.Options): Promise<get.ReturnType> {
  return Action.promise("name.get", Impl.get, client, options);
}

export declare namespace get {
  /** Options for {@link get}. */
  type Options = Pick<Read.Options, "signal"> &
    Read.BlockOptions & {
      /** ENS name to read. Normalized automatically. */
      name: string;
    };
  /** The name's full state. */
  type ReturnType = NameState;
  /** Errors {@link get} can fail with. */
  type ErrorType = AnyError;
}

/** Builds a deferred read for `Actions.batch`. */
get.request = Action.request("name.get", Impl.get);

/** Path of the action, e.g. for cache keys. */
get.path = "name.get" as const;
