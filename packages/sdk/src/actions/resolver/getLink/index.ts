import type { Address } from "viem";

import type { Like } from "../../../client/types.js";
import type { AnyError } from "../../../errors/types.js";
import * as Action from "../../../internal/action/index.js";
import type { Read } from "../../../Types.js";
import * as Impl from "./effect.js";

/**
 * Reads which record set an ENS name uses on its PermissionedResolver.
 *
 * **When to use**
 *
 * Use to tell whether names share records: linked names have the same `recordId` on the same
 * resolver.
 *
 * **Details**
 *
 * - Every name gets its own record ID on its first write; {@link Actions.resolver.link} points a
 *   name at another name's record ID.
 * - Returns `null` when the name has no records on the resolver yet, unless `strict` is set.
 *
 * **Example** (Checking whether two names share records)
 *
 * ```ts
 * const [a, b] = await Promise.all([
 *   ens.resolver.getLink({ name: "alice.eth" }),
 *   ens.resolver.getLink({ name: "alice-main.eth" }),
 * ])
 * const shared = a !== null && b !== null && a.resolver === b.resolver && a.recordId === b.recordId
 * ```
 *
 * **Example** (Reading with a standalone call)
 *
 * ```ts
 * import { Actions } from "@ensforge/sdk"
 *
 * const link = await Actions.resolver.getLink(publicClient, { name: "alice.eth" })
 * ```
 *
 * **Example** (Reading in an Effect program)
 *
 * ```ts
 * import { Actions } from "@ensforge/sdk/effect"
 *
 * const link = yield* Actions.resolver.getLink(ens, { name: "alice.eth" })
 * ```
 *
 * @throws `Errors.InvalidInputError` (`INVALID_NAME`) when the name cannot be normalized.
 * @throws `Errors.NotFoundError` (`RESOLVER_NOT_FOUND`, `RECORD_NOT_FOUND`) without a resolver, or with `strict` and no records.
 * @throws `Errors.UnsupportedError` (`RESOLVER_PROFILE_UNSUPPORTED`) when the resolver is not a PermissionedResolver.
 * @throws `Errors.NetworkError` when the RPC request fails.
 *
 * @see {@link Actions.resolver.link} to link names
 * @stability stable
 * @category reading
 * @since 1.0.0
 */
export function getLink(client: Like, options: getLink.Options): Promise<getLink.ReturnType> {
  return Action.promise("resolver.getLink", Impl.getLink, client, options);
}

export declare namespace getLink {
  /** Options for {@link getLink}. */
  type Options = Pick<Read.Options, "signal" | "strict"> &
    Read.BlockOptions & {
      /** ENS name to read. Normalized automatically. */
      name: string;
    };
  /** The resolver and the name's record ID, or `null` when it has no records there. */
  type ReturnType = { readonly resolver: Address; readonly recordId: bigint } | null;
  /** Errors {@link getLink} can fail with. */
  type ErrorType = AnyError;
}

/** Builds a deferred read for `Actions.batch`. */
getLink.request = Action.request("resolver.getLink", Impl.getLink);
