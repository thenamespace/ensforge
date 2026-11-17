import type { Like } from "../../../client/types.js";
import type { AnyError } from "../../../errors/types.js";
import type { Query } from "../../../indexer/Indexer.js";
import type { IndexedRegistry, Result } from "../../../indexer/types.js";
import * as Action from "../../../internal/action/index.js";
import type { Read } from "../../../Types.js";
import * as Impl from "./effect.js";

/**
 * Reads an ENSv2 registry: the name it serves, its parent registry, when it was created and its counts.
 *
 * **When to use**
 *
 * Use to inspect a registry found through a name's `subregistry`, e.g. in an explorer.
 *
 * **Details**
 *
 * - `includeCounts` adds the number of labels, roles and events.
 *
 * **Example** (Reading a registry)
 *
 * ```ts
 * const registry = await ens.indexer.getRegistry({ address: "0x02ca…" })
 * ```
 *
 * **Example** (Reading a registry with counts with a standalone call)
 *
 * ```ts
 * import { Actions } from "@ensforge/sdk"
 *
 * const registry = await Actions.indexer.getRegistry(ens, { address, includeCounts: true })
 * ```
 *
 * **Example** (Reading a registry in an Effect program)
 *
 * ```ts
 * import { Actions } from "@ensforge/sdk/effect"
 *
 * const registry = yield* Actions.indexer.getRegistry(ens, { address })
 * ```
 *
 * @throws `Errors.InvalidInputError` (`INVALID_ADDRESS`) for an invalid address.
 * @throws `Errors.NotFoundError` (`INDEXER_NOT_FOUND`) with `strict: true` when the indexer does not know the contract.
 * @throws `Errors.ConfigError` (`INDEXER_NOT_CONFIGURED`) when the client has no indexer.
 * @throws `Errors.IndexerError` (`INDEXER_UNSUPPORTED`) when the indexer does not serve the query or its namespace.
 * @throws `Errors.IndexerError` when the indexer is unavailable, rate limiting, behind or answers unexpectedly.
 *
 * @see {@link Actions.registry.get} for the on-chain read
 * @stability stable
 * @category indexer
 * @since 1.0.0
 */
export function getRegistry(
  client: Like,
  options: getRegistry.Options,
): Promise<getRegistry.ReturnType> {
  return Action.promise("indexer.getRegistry", Impl.getRegistry, client, options);
}

export declare namespace getRegistry {
  /** Options for {@link getRegistry}. */
  type Options = Pick<Read.Options, "signal" | "strict"> &
    Query.Snapshot & {
      /** Contract address. */
      address: string;
      /** Chain of the contract. @default the client's chain */
      chainId?: number | undefined;
      /** Include label, role and event counts. */
      includeCounts?: boolean | undefined;
    };
  /** The registry, or `null` when the indexer does not know it. */
  type ReturnType = Result<IndexedRegistry> | null;
  /** Errors {@link getRegistry} can fail with. */
  type ErrorType = AnyError;
}

/** Builds a deferred read for `Actions.batch`. */
getRegistry.request = Action.request("indexer.getRegistry", Impl.getRegistry);
