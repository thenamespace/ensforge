import type { Like } from "../../../client/types.js";
import type { AnyError } from "../../../errors/types.js";
import type { Namespace, NamespaceInfo, Result } from "../../../indexer/types.js";
import * as Action from "../../../internal/action/index.js";
import type { Read } from "../../../Types.js";
import * as Impl from "./effect.js";

/**
 * Reads what the indexer serves for a namespace: its networks and which features are complete.
 *
 * **When to use**
 *
 * Use to decide which features to show, e.g. hide verified records where they are unsupported.
 *
 * **Example** (Reading ENS coverage)
 *
 * ```ts
 * const ens_ = await ens.indexer.getNamespace()
 * ```
 *
 * **Example** (Reading Basenames coverage with a standalone call)
 *
 * ```ts
 * import { Actions } from "@ensforge/sdk"
 *
 * const basenames = await Actions.indexer.getNamespace(ens, { namespace: "basenames" })
 * ```
 *
 * **Example** (Reading coverage in an Effect program)
 *
 * ```ts
 * import { Actions } from "@ensforge/sdk/effect"
 *
 * const info = yield* Actions.indexer.getNamespace(ens, { namespace: "ens" })
 * ```
 *
 * @throws `Errors.NotFoundError` (`INDEXER_NOT_FOUND`) with `strict: true` when the indexer does not know the namespace.
 * @throws `Errors.ConfigError` (`INDEXER_NOT_CONFIGURED`) when the client has no indexer.
 * @throws `Errors.IndexerError` (`INDEXER_UNSUPPORTED`) when the indexer does not serve the query or its namespace.
 * @throws `Errors.IndexerError` when the indexer is unavailable, rate limiting, behind or answers unexpectedly.
 *
 * @stability stable
 * @category indexer
 * @since 1.0.0
 */
export function getNamespace(
  client: Like,
  options?: getNamespace.Options,
): Promise<getNamespace.ReturnType> {
  return Action.promise("indexer.getNamespace", Impl.getNamespace, client, options ?? {});
}

export declare namespace getNamespace {
  /** Options for {@link getNamespace}. */
  type Options = Pick<Read.Options, "signal" | "strict"> & {
    /** @default "ens" */
    namespace?: Namespace | undefined;
  };
  /** The namespace's coverage, or `null` when the indexer does not know it. */
  type ReturnType = Result<NamespaceInfo> | null;
  /** Errors {@link getNamespace} can fail with. */
  type ErrorType = AnyError;
}

/** Builds a deferred read for `Actions.batch`. */
getNamespace.request = Action.request("indexer.getNamespace", Impl.getNamespace);

/** Path of the action, e.g. for cache keys. */
getNamespace.path = "indexer.getNamespace" as const;
