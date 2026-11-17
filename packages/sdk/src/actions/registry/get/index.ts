import type { Like } from "../../../client/types.js";
import type { AnyError } from "../../../errors/types.js";
import * as Action from "../../../internal/action/index.js";
import type { Read } from "../../../Types.js";
import * as Impl from "./effect.js";
import type { RegistryInfo } from "./types.js";

/**
 * Reads an ENSv2 registry: its kind, implementation, parent, canonical name, URI, whether it is
 * emancipated, and whether it can be upgraded.
 *
 * **When to use**
 *
 * Use to inspect the registry that holds a name's children before creating subnames or
 * upgrading it.
 *
 * **Details**
 *
 * - `{ name }` reads the name's subregistry (where its children live); `{ registry }` reads any
 *   registry by address.
 * - An emancipated registry's owners cannot take children back.
 * - Every upgrade needs the target to accept the current implementation (`canUpgradeFrom`);
 *   emancipated registries also need it listed in their upgrade set.
 * - Pass `account` to include whether it holds the `upgrade` role (`blocker: "unauthorized"`).
 * - Returns `null` when the name has no subregistry, unless `strict` is set.
 *
 * **Example** (Inspecting a name's subregistry)
 *
 * ```ts
 * const registry = await ens.registry.get({ name: "nick.eth" })
 * registry?.emancipated // false
 * ```
 *
 * **Example** (Reading a registry by address with a standalone call)
 *
 * ```ts
 * import { Actions } from "@ensforge/sdk"
 *
 * const registry = await Actions.registry.get(publicClient, { registry: "0x02cA46F62f6C9F655364bf9Fd4f11Fb8f01C5753" })
 * ```
 *
 * **Example** (Checking upgrade eligibility in an Effect program)
 *
 * ```ts
 * import { Actions } from "@ensforge/sdk/effect"
 *
 * const registry = yield* Actions.registry.get(ens, { name: "nick.eth", account })
 * ```
 *
 * @throws `Errors.InvalidInputError` (`INVALID_NAME`, `INVALID_ADDRESS`) for invalid input.
 * @throws `Errors.NotFoundError` (`REGISTRY_NOT_FOUND`) with `strict` when the name has no subregistry.
 * @throws `Errors.NetworkError` when the RPC request fails.
 *
 * @see {@link Actions.registry.upgrade} to upgrade it
 * @stability stable
 * @category reading
 * @since 1.0.0
 */
export function get(client: Like, options: get.Options): Promise<get.ReturnType> {
  return Action.promise("registry.get", Impl.get, client, options);
}

export declare namespace get {
  /** Options for {@link get}. */
  type Options = Pick<Read.Options, "signal" | "strict"> &
    Read.BlockOptions &
    ({ name: string } | { registry: string }) & {
      /** Account whose `upgrade` role is checked for `upgrade.blocker`. */
      account?: string | undefined;
    };
  /** The registry, or `null` when the name has no subregistry. */
  type ReturnType = RegistryInfo | null;
  /** Errors {@link get} can fail with. */
  type ErrorType = AnyError;
}

/** Builds a deferred read for `Actions.batch`. */
get.request = Action.request("registry.get", Impl.get);
