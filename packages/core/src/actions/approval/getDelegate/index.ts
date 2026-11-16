import type { Like } from "../../../client/types.js";
import type { AnyError } from "../../../errors/types.js";
import * as Action from "../../../internal/action/index.js";
import type { Read } from "../../../Types.js";
import * as Impl from "./effect.js";

/**
 * Checks whether a delegate may edit a name's records on its public resolver
 * (`isApprovedFor`).
 *
 * **When to use**
 *
 * Use to see who besides the owner can edit a profile on a PublicResolver.
 *
 * **Details**
 *
 * - The owner defaults to the one the resolver authorizes against: the ENS registry owner (or
 *   NameWrapper owner) for ENSv1 resolvers, the ENSv2 owner for PublicResolverV2.
 * - PermissionedResolvers have roles instead of delegates and answer `false`.
 *
 * **Example** (Checking a delegate)
 *
 * ```ts
 * const approved = await ens.approval.getDelegate({ name: "alice.eth", delegate })
 * ```
 *
 * **Example** (Checking with a standalone call)
 *
 * ```ts
 * import { Actions } from "@ensforge/core"
 *
 * const approved = await Actions.approval.getDelegate(publicClient, { name: "vitalik.eth", delegate })
 * ```
 *
 * **Example** (Checking in an Effect program)
 *
 * ```ts
 * import { Actions } from "@ensforge/core/effect"
 *
 * const approved = yield* Actions.approval.getDelegate(ens, { name: "alice.eth", delegate })
 * ```
 *
 * @throws `Errors.InvalidInputError` (`INVALID_NAME`, `INVALID_ADDRESS`) for invalid input.
 * @throws `Errors.NotFoundError` (`RESOLVER_NOT_FOUND`) when the name has no resolver.
 * @throws `Errors.NetworkError` when the RPC request fails.
 *
 * @see {@link Actions.approval.setDelegate} to change it
 * @stability stable
 * @category reading
 * @since 1.0.0
 */
export function getDelegate(
  client: Like,
  options: getDelegate.Options,
): Promise<getDelegate.ReturnType> {
  return Action.promise("approval.getDelegate", Impl.getDelegate, client, options);
}

export declare namespace getDelegate {
  /** Options for {@link getDelegate}. */
  type Options = Pick<Read.Options, "signal"> &
    Read.BlockOptions & {
      /** ENS name. Normalized automatically. */
      name: string;
      /** Account that may be a delegate. */
      delegate: string;
      /**
       * Owner who granted the delegation.
       *
       * @default the owner the resolver authorizes against
       */
      owner?: string | undefined;
    };
  /** Whether `delegate` may edit the name's records. */
  type ReturnType = boolean;
  /** Errors {@link getDelegate} can fail with. */
  type ErrorType = AnyError;
}

/** Builds a deferred read for `Actions.batch`. */
getDelegate.request = Action.request("approval.getDelegate", Impl.getDelegate);
