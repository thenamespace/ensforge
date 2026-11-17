import type { Like } from "../../../client/types.js";
import type { AnyError } from "../../../errors/types.js";
import * as Action from "../../../internal/action/index.js";
import type { Read } from "../../../Types.js";
import * as Impl from "./effect.js";
import type { ResolverInfo } from "./types.js";

/**
 * Reads the resolver of an ENS name: its address, what kind of resolver it is, who may write to
 * it and which record profiles it supports.
 *
 * **When to use**
 *
 * Use to show where a name's records live, or to check that its resolver can store a record
 * before writing it.
 *
 * **Details**
 *
 * - The name's own resolver comes from the registry that holds the name (ENSv1 or ENSv2).
 * - Without one, the resolver serving the name is returned with `inherited: true`: a parent's
 *   wildcard resolver or an off-chain resolver. For ENSv1 names that ENSv2 serves through the
 *   ENSv1 bridge, it is the ENSv1 resolver behind the bridge, as before the ENSv2 launch.
 * - Costs three batched calls: name state, then one round of ERC-165 checks.
 * - Returns `null` when nothing resolves the name, unless `strict` is set.
 *
 * **Gotchas**
 *
 * - An inherited resolver belongs to a parent: records cannot be written there for this name.
 *
 * **Example** (Checking a resolver before writing)
 *
 * ```ts
 * const resolver = await ens.resolver.get({ name: "nick.eth" })
 * if (resolver?.profiles.data) await ens.record.set({ name: "nick.eth", data: { key: "0x01" } })
 * ```
 *
 * **Example** (Reading with a bare viem client)
 *
 * ```ts
 * import { Actions } from "@ensforge/sdk"
 *
 * const resolver = await Actions.resolver.get(publicClient, { name: "vitalik.eth" })
 * resolver?.kind // "public-resolver"
 * ```
 *
 * **Example** (Reading in an Effect program)
 *
 * ```ts
 * import { Actions } from "@ensforge/sdk/effect"
 *
 * const resolver = yield* Actions.resolver.get(ens, { name: "nick.eth", strict: true })
 * ```
 *
 * @throws `Errors.InvalidInputError` (`INVALID_NAME`) when the name cannot be normalized.
 * @throws `Errors.NotFoundError` (`RESOLVER_NOT_FOUND`) with `strict` when nothing resolves the name.
 * @throws `Errors.NetworkError` when the RPC request fails.
 *
 * @see {@link Actions.resolver.set} to change it
 * @stability stable
 * @category reading
 * @since 1.0.0
 */
export function get(client: Like, options: get.Options): Promise<get.ReturnType> {
  return Action.promise("resolver.get", Impl.get, client, options);
}

export declare namespace get {
  /** Options for {@link get}. */
  type Options = Pick<Read.Options, "signal" | "strict"> &
    Read.BlockOptions & {
      /** ENS name to read. Normalized automatically. */
      name: string;
    };
  /** The resolver, or `null` when nothing resolves the name. */
  type ReturnType = ResolverInfo | null;
  /** Errors {@link get} can fail with. */
  type ErrorType = AnyError;
}

/** Builds a deferred read for `Actions.batch`. */
get.request = Action.request("resolver.get", Impl.get);

/** Path of the action, e.g. for cache keys. */
get.path = "resolver.get" as const;
