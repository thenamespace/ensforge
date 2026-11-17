import type { Like } from "../../../client/types.js";
import type { AnyError } from "../../../errors/types.js";
import type { Query } from "../../../indexer/Indexer.js";
import type { Page, RegistryLabel } from "../../../indexer/types.js";
import * as Action from "../../../internal/action/index.js";
import type { Read } from "../../../Types.js";
import * as Impl from "./effect.js";

/**
 * Lists the labels of an ENSv2 registry, optionally only those an address holds or does not hold.
 *
 * **When to use**
 *
 * Use to browse a registry's names, e.g. the subnames recreated during migration.
 *
 * **Details**
 *
 * - `owner` and `excludeOwner` cannot be combined.
 *
 * **Example** (Listing a registry's labels)
 *
 * ```ts
 * const page = await ens.indexer.getRegistryLabels({ address: "0x02ca…" })
 * ```
 *
 * **Example** (Listing labels an address holds with a standalone call)
 *
 * ```ts
 * import { Actions } from "@ensforge/sdk"
 *
 * const page = await Actions.indexer.getRegistryLabels(ens, { address, owner: account })
 * ```
 *
 * **Example** (Listing a registry's labels in an Effect program)
 *
 * ```ts
 * import { Actions } from "@ensforge/sdk/effect"
 *
 * const page = yield* Actions.indexer.getRegistryLabels(ens, { address, limit: 200 })
 * ```
 *
 * @throws `Errors.InvalidInputError` (`INVALID_ADDRESS`) for an invalid address.
 * @throws `Errors.ConfigError` (`INDEXER_NOT_CONFIGURED`) when the client has no indexer.
 * @throws `Errors.IndexerError` (`INDEXER_UNSUPPORTED`) when the indexer does not serve the query or its namespace.
 * @throws `Errors.IndexerError` when the indexer is unavailable, rate limiting, behind or answers unexpectedly.
 *
 * @stability stable
 * @category indexer
 * @since 1.0.0
 */
export function getRegistryLabels(
  client: Like,
  options: getRegistryLabels.Options,
): Promise<getRegistryLabels.ReturnType> {
  return Action.promise("indexer.getRegistryLabels", Impl.getRegistryLabels, client, options);
}

export declare namespace getRegistryLabels {
  /** Options for {@link getRegistryLabels}. */
  type Options = Pick<Read.Options, "signal"> &
    Query.List & {
      /** Contract address. */
      address: string;
      /** Chain of the contract. @default the client's chain */
      chainId?: number | undefined;
      /** Only labels this address holds. */
      owner?: string | undefined;
      /** Only labels this address does not hold. */
      excludeOwner?: string | undefined;
    };
  /** One page of labels. */
  type ReturnType = Page<RegistryLabel>;
  /** Errors {@link getRegistryLabels} can fail with. */
  type ErrorType = AnyError;
}

/** Builds a deferred read for `Actions.batch`. */
getRegistryLabels.request = Action.request("indexer.getRegistryLabels", Impl.getRegistryLabels);
