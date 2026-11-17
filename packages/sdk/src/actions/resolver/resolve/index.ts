import type { Address, Hex } from "viem";

import type { Like } from "../../../client/types.js";
import type { AnyError } from "../../../errors/types.js";
import * as Action from "../../../internal/action/index.js";
import type { Read } from "../../../Types.js";
import * as Impl from "./effect.js";

/**
 * Calls the resolver of an ENS name with raw calldata through the Universal Resolver (ENSIP-10).
 *
 * **When to use**
 *
 * Use to read resolver profiles ensforge has no action for. Use {@link Actions.record.get} for
 * the standard records.
 *
 * **Details**
 *
 * - Finds the resolver like any ENS client: the name's own, a parent's wildcard, or off-chain
 *   through CCIP-Read.
 * - `data` is the resolver call, with the name's node as its first argument.
 * - Returns the ABI-encoded result and the resolver that answered.
 *
 * **Example** (Calling a custom profile)
 *
 * ```ts
 * import { encodeFunctionData, namehash, parseAbi } from "viem"
 *
 * const abi = parseAbi(["function text(bytes32, string) view returns (string)"])
 * const data = encodeFunctionData({ abi, functionName: "text", args: [namehash("nick.eth"), "url"] })
 * const { data: result } = await ens.resolver.resolve({ name: "nick.eth", data })
 * ```
 *
 * **Example** (Resolving with a standalone call)
 *
 * ```ts
 * import { Actions } from "@ensforge/sdk"
 *
 * const { resolver } = await Actions.resolver.resolve(publicClient, { name: "nick.eth", data })
 * ```
 *
 * **Example** (Resolving in an Effect program)
 *
 * ```ts
 * import { Actions } from "@ensforge/sdk/effect"
 *
 * const result = yield* Actions.resolver.resolve(ens, { name: "nick.eth", data })
 * ```
 *
 * @throws `Errors.InvalidInputError` (`INVALID_NAME`, `INVALID_RECORD_VALUE`) for an invalid name or calldata.
 * @throws `Errors.NotFoundError` (`RESOLVER_NOT_FOUND`) when nothing resolves the name.
 * @throws `Errors.UnsupportedError` (`RESOLVER_PROFILE_UNSUPPORTED`) when the resolver does not answer the call.
 * @throws `Errors.GatewayError` when an off-chain gateway fails.
 * @throws `Errors.ConfigError` (`CCIP_READ_DISABLED`) for off-chain names when CCIP-Read is disabled.
 *
 * @see {@link Actions.resolver.get} to inspect the resolver
 * @stability stable
 * @category reading
 * @since 1.0.0
 */
export function resolve(client: Like, options: resolve.Options): Promise<resolve.ReturnType> {
  return Action.promise("resolver.resolve", Impl.resolve, client, options);
}

export declare namespace resolve {
  /** Options for {@link resolve}. */
  type Options = Omit<Read.Options, "strict"> & {
    /** ENS name to resolve. Normalized automatically. */
    name: string;
    /** Resolver calldata, e.g. `text(node, key)`. */
    data: Hex;
  };
  /** The ABI-encoded result and the resolver that answered. */
  type ReturnType = { readonly data: Hex; readonly resolver: Address };
  /** Errors {@link resolve} can fail with. */
  type ErrorType = AnyError;
}

/** Builds a deferred read for `Actions.batch`. */
resolve.request = Action.request("resolver.resolve", Impl.resolve);

/** Path of the action, e.g. for cache keys. */
resolve.path = "resolver.resolve" as const;
