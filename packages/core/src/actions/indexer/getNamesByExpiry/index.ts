import type { Like } from "../../../client/types.js";
import type { AnyError } from "../../../errors/types.js";
import type { Query } from "../../../indexer/Indexer.js";
import type { ExpiringName, Namespace, Page } from "../../../indexer/types.js";
import * as Action from "../../../internal/action/index.js";
import type { Read } from "../../../Types.js";
import * as Impl from "./effect.js";

/**
 * Lists names by when they expire or leave their grace period.
 *
 * **When to use**
 *
 * Use to find names expiring soon, e.g. renewal reminders or a drop-catching list.
 *
 * **Details**
 *
 * - Pass either expiry bounds (`expiresAfter`, `expiresBefore`, `windows`) or grace bounds
 *   (`graceEndsAfter`, `graceEndsBefore`, `graceWindows`), not both.
 * - With `windows`, each name reports the window it matched (`windowIndex`).
 *
 * **Example** (Listing names expiring this month)
 *
 * ```ts
 * const page = await ens.indexer.getNamesByExpiry({ expiresAfter: new Date(), expiresBefore: inAMonth })
 * ```
 *
 * **Example** (Listing names leaving grace with a standalone call)
 *
 * ```ts
 * import { Actions } from "@ensforge/core"
 *
 * const page = await Actions.indexer.getNamesByExpiry(ens, { graceEndsBefore: tomorrow })
 * ```
 *
 * **Example** (Listing subnames by expiry in an Effect program)
 *
 * ```ts
 * import { Actions } from "@ensforge/core/effect"
 *
 * const page = yield* Actions.indexer.getNamesByExpiry(ens, { parent: "eth", expiresBefore: inAWeek })
 * ```
 *
 * @throws `Errors.InvalidInputError` (`INVALID_NAME`) when `parent` does not normalize.
 * @throws `Errors.ConfigError` (`INDEXER_NOT_CONFIGURED`) when the client has no indexer.
 * @throws `Errors.IndexerError` (`INDEXER_UNSUPPORTED`) when the indexer does not serve the query or its namespace.
 * @throws `Errors.IndexerError` when the indexer is unavailable, rate limiting, behind or answers unexpectedly.
 *
 * @stability stable
 * @category indexer
 * @since 1.0.0
 */
export function getNamesByExpiry(
  client: Like,
  options: getNamesByExpiry.Options,
): Promise<getNamesByExpiry.ReturnType> {
  return Action.promise("indexer.getNamesByExpiry", Impl.getNamesByExpiry, client, options);
}

export declare namespace getNamesByExpiry {
  /** Options for {@link getNamesByExpiry}. */
  type Options = Pick<Read.Options, "signal"> &
    Omit<Query.GetNamesByExpiry, "namespace"> & {
      /** @default "ens" */
      namespace?: Namespace | undefined;
    };
  /** One page of names, soonest first unless `order` says otherwise. */
  type ReturnType = Page<ExpiringName>;
  /** Errors {@link getNamesByExpiry} can fail with. */
  type ErrorType = AnyError;
}

/** Builds a deferred read for `Actions.batch`. */
getNamesByExpiry.request = Action.request("indexer.getNamesByExpiry", Impl.getNamesByExpiry);
