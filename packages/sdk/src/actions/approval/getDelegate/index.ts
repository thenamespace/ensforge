import type { Like } from "../../../client/types.js";
import type * as Errors from "../../../errors/index.js";
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
 * - Basenames and Linea names are read on their resolver on the L2.
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
 * import { Actions } from "@ensforge/sdk"
 *
 * const approved = await Actions.approval.getDelegate(publicClient, { name: "vitalik.eth", delegate })
 * ```
 *
 * **Example** (Checking in an Effect program)
 *
 * ```ts
 * import { Actions } from "@ensforge/sdk/effect"
 *
 * const approved = yield* Actions.approval.getDelegate(ens, { name: "alice.eth", delegate })
 * ```
 *
 * @throws `Errors.InvalidInputError` (`INVALID_NAME`, `INVALID_ADDRESS`) for invalid input.
 * @throws `Errors.NotFoundError` (`RESOLVER_NOT_FOUND`) when the name has no resolver.
 * @throws `Errors.NameStateError` (`NAME_EXTERNAL`) for a name in an L2 namespace without delegates.
 * @throws `Errors.ConfigError` (`CHAIN_NOT_CONFIGURED`) when the name lives on an L2 the client cannot reach.
 * @throws `Errors.NetworkError` (`RPC_REQUEST_FAILED`, `RPC_TIMEOUT`, `RATE_LIMITED`) when the RPC request fails.
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
  type ErrorType =
    | Errors.CommonError
    | Errors.InvalidInputError
    | Errors.NotFoundError
    | Errors.NameStateError;
}

/** Builds a deferred read for `Actions.batch`. */
getDelegate.request = Action.request(
  "approval.getDelegate",
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- Action.Declared narrows errors to the documented @throws
  Impl.getDelegate as Action.Declared<typeof Impl.getDelegate, getDelegate.ErrorType>,
);

/** Path of the action, e.g. for cache keys. */
getDelegate.path = "approval.getDelegate" as const;
