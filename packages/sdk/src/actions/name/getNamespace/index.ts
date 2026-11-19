import type { Like } from "../../../client/types.js";
import type * as Errors from "../../../errors/index.js";
import * as Action from "../../../internal/action/index.js";
import type { Read } from "../../../Types.js";
import type { NameNamespace } from "../get/types.js";
import * as Impl from "./effect.js";

/**
 * Finds where a name lives outside ENS's registries: the L2 namespace that holds it (Basenames,
 * Linea Names, Celonames, Durin, Namespace) or the off-chain provider that serves it.
 *
 * **When to use**
 *
 * Use to know which chain to read a name from or send its record writes to, without reading its
 * full state. `name.get` returns the same location as `namespace`.
 *
 * **Details**
 *
 * - `kind: "l2"` names the namespace family, its parent name, the L2's `chainId` and the registry
 *   there that holds the name (`null` when the L2 could not be reached).
 * - `kind: "offchain"` names the provider whose gateway serves the name, or `null` when ensforge
 *   does not know it. No gateway is contacted.
 * - Returns `null` for names in ENS, and for names nothing serves.
 * - The L2 namespaces come from the client's deployment profile (`Deployments.Profile.namespaces`).
 *   Durin and Namespace names cost a read on Ethereum and one on their L2.
 * - A client remembers a name's location for a minute, and forgets it after its own writes.
 *
 * **Gotchas**
 *
 * - The location says where the name would live, not that it is registered there:
 *   `unclaimed.base.eth` is on Base too.
 *
 * **Example** (Finding the chain of a Basename)
 *
 * ```ts
 * const namespace = await ens.name.getNamespace({ name: "jesse.base.eth" })
 * if (namespace?.kind === "l2") console.log(namespace.id, namespace.chainId) // "basenames" 8453
 * ```
 *
 * **Example** (Finding with a bare viem client)
 *
 * ```ts
 * import { Actions } from "@ensforge/sdk"
 *
 * const namespace = await Actions.name.getNamespace(publicClient, { name: "jesse.base.eth" })
 * ```
 *
 * **Example** (Finding in an Effect program)
 *
 * ```ts
 * import { Actions } from "@ensforge/sdk/effect"
 *
 * const namespace = yield* Actions.name.getNamespace(ens, { name: "jesse.base.eth" })
 * ```
 *
 * @throws `Errors.InvalidInputError` (`INVALID_NAME`) when the name is invalid or the root.
 * @throws `Errors.NetworkError` (`RPC_REQUEST_FAILED`, `RPC_TIMEOUT`, `RATE_LIMITED`) when the RPC request fails.
 *
 * @see {@link Actions.name.get} for the name's full state
 * @stability stable
 * @category reading
 * @since 1.1.0
 */
export function getNamespace(
  client: Like,
  options: getNamespace.Options,
): Promise<getNamespace.ReturnType> {
  return Action.promise("name.getNamespace", Impl.getNamespace, client, options);
}

export declare namespace getNamespace {
  /** Options for {@link getNamespace}. */
  type Options = Pick<Read.Options, "signal"> &
    Read.BlockOptions & {
      /** ENS name to locate. Normalized automatically. */
      name: string;
    };
  /** Where the name lives, or `null` for names in ENS. */
  type ReturnType = NameNamespace | null;
  /** Errors {@link getNamespace} can fail with. */
  type ErrorType = Errors.CommonError | Errors.InvalidInputError;
}

/** Builds a deferred read for `Actions.batch`. */
getNamespace.request = Action.request(
  "name.getNamespace",
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- Action.Declared narrows errors to the documented @throws
  Impl.getNamespace as Action.Declared<typeof Impl.getNamespace, getNamespace.ErrorType>,
);

/** Path of the action, e.g. for cache keys. */
getNamespace.path = "name.getNamespace" as const;
