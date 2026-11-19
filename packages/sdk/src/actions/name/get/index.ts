import type { Like } from "../../../client/types.js";
import type * as Errors from "../../../errors/index.js";
import * as Action from "../../../internal/action/index.js";
import type { Read } from "../../../Types.js";
import * as Impl from "./effect.js";
import type { NameState } from "./types.js";

export type { NameKind, NameNamespace, NameState, NameStatus } from "./types.js";

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
 * - `inheritedResolver` is the resolver serving a name that has none of its own: a parent's
 *   wildcard or off-chain resolver, or the ENSv1 resolver behind the ENSv1 bridge.
 * - Costs two batched RPC calls, whatever the name kind. A name without a resolver of its own
 *   that a parent's resolver serves costs one more (two behind the ENSv1 bridge), and one more
 *   when no registry holds it (an `eth_call` asking the resolver whether it serves the name).
 *
 * **Gotchas**
 *
 * - `resolver` is the resolver set on the name itself. A name served only by a parent's wildcard
 *   or off-chain resolver (such as `jesse.base.eth` or `test.uni.eth`) has `resolver: null` and is
 *   in no registry: it is `offchain` or `wildcard` with status `external`, and its parent's
 *   namespace (an L2, or the provider) manages it. `inheritedResolver` is the resolver serving it.
 * - `offchain` means a gateway answers for the name, not that the gateway holds it: ENS cannot
 *   tell, so an unclaimed label under such a parent is `offchain` too. The check never contacts
 *   the gateway.
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
 * @throws `Errors.NetworkError` (`RPC_REQUEST_FAILED`, `RPC_TIMEOUT`, `RATE_LIMITED`) when the RPC request fails.
 *
 * @see {@link Actions.resolver.get} to describe the resolver
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
  type ErrorType = Errors.CommonError | Errors.InvalidInputError;
}

/** Builds a deferred read for `Actions.batch`. */
get.request = Action.request(
  "name.get",
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- Action.Declared narrows errors to the documented @throws
  Impl.get as Action.Declared<typeof Impl.get, get.ErrorType>,
);

/** Path of the action, e.g. for cache keys. */
get.path = "name.get" as const;
