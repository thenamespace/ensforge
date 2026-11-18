import type { Like } from "../../../client/types.js";
import type * as Errors from "../../../errors/index.js";
import type { IndexerStatus } from "../../../indexer/types.js";
import * as Action from "../../../internal/action/index.js";
import type { Read } from "../../../Types.js";
import * as Impl from "./effect.js";

/**
 * Reads the indexer's health and how far each chain is indexed.
 *
 * **When to use**
 *
 * Use to show a sync banner, or to wait until a write is indexed before reading it back.
 *
 * **Details**
 *
 * - Chains are keyed by chain ID; `safe` and `finalized` are `null` when the indexer does not
 *   track them.
 *
 * **Example** (Reading the status)
 *
 * ```ts
 * const status = await ens.indexer.getStatus()
 * ```
 *
 * **Example** (Reading the status with a standalone call)
 *
 * ```ts
 * import { Actions } from "@ensforge/sdk"
 *
 * const { chains } = await Actions.indexer.getStatus(ens)
 * ```
 *
 * **Example** (Reading the status in an Effect program)
 *
 * ```ts
 * import { Actions } from "@ensforge/sdk/effect"
 *
 * const status = yield* Actions.indexer.getStatus(ens)
 * ```
 *
 * @throws `Errors.ConfigError` (`INDEXER_NOT_CONFIGURED`) when the client has no indexer.
 * @throws `Errors.IndexerError` (`INDEXER_UNSUPPORTED`) when the indexer does not serve the query or its namespace.
 * @throws `Errors.IndexerError` when the indexer is unavailable, rate limiting, behind or answers unexpectedly.
 *
 * @stability stable
 * @category indexer
 * @since 1.0.0
 */
export function getStatus(
  client: Like,
  options?: getStatus.Options,
): Promise<getStatus.ReturnType> {
  return Action.promise("indexer.getStatus", Impl.getStatus, client, options ?? {});
}

export declare namespace getStatus {
  /** Options for {@link getStatus}. */
  type Options = Pick<Read.Options, "signal">;
  /** Overall status and per-chain progress. */
  type ReturnType = IndexerStatus;
  /** Errors {@link getStatus} can fail with. */
  type ErrorType = Errors.CommonError | Errors.IndexerError;
}

/** Builds a deferred read for `Actions.batch`. */
getStatus.request = Action.request(
  "indexer.getStatus",
  Impl.getStatus as Action.Declared<typeof Impl.getStatus, getStatus.ErrorType>,
);

/** Path of the action, e.g. for cache keys. */
getStatus.path = "indexer.getStatus" as const;
