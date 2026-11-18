import type { Like } from "../../../client/types.js";
import type * as Errors from "../../../errors/index.js";
import type { Query } from "../../../indexer/Indexer.js";
import type { IndexedNameDetail, Namespace, Result } from "../../../indexer/types.js";
import * as Action from "../../../internal/action/index.js";
import type { Read } from "../../../Types.js";
import * as Impl from "./effect.js";

/**
 * Reads one name from the indexer: owner, manager, expiry, resolver, records and protocol.
 *
 * **When to use**
 *
 * Use to show a name page, or anywhere an indexed answer is fast enough; for an authoritative on-
 * chain read, use `name.get`.
 *
 * **Details**
 *
 * - Basenames (`*.base.eth`) are read from the `basenames` namespace.
 * - `authority` says which protocol holds the name (`ensV0`, `ensV1` or `ensV2`).
 * - `source: "verified"` asks the indexer to read the answer on-chain (bigname).
 * - Returns `null` when the indexer has no such name, or throws with `strict: true`.
 *
 * **Example** (Reading a name)
 *
 * ```ts
 * const name = await ens.indexer.getName({ name: "nick.eth" })
 * ```
 *
 * **Example** (Reading a name with a standalone call)
 *
 * ```ts
 * import { Actions } from "@ensforge/sdk"
 *
 * const name = await Actions.indexer.getName(ens, { name: "jesse.base.eth" })
 * ```
 *
 * **Example** (Reading a name in an Effect program)
 *
 * ```ts
 * import { Actions } from "@ensforge/sdk/effect"
 *
 * const name = yield* Actions.indexer.getName(ens, { name: "nick.eth", strict: true })
 * ```
 *
 * @throws `Errors.InvalidInputError` (`INVALID_NAME`) when the name does not normalize.
 * @throws `Errors.NotFoundError` (`INDEXER_NOT_FOUND`) with `strict: true` when the indexer has no such name.
 * @throws `Errors.ConfigError` (`INDEXER_NOT_CONFIGURED`) when the client has no indexer.
 * @throws `Errors.IndexerError` (`INDEXER_UNSUPPORTED`) when the indexer does not serve the query or its namespace.
 * @throws `Errors.IndexerError` when the indexer is unavailable, rate limiting, behind or answers unexpectedly.
 *
 * @see {@link Actions.name.get} for the on-chain state
 * @stability stable
 * @category indexer
 * @since 1.0.0
 */
export function getName(client: Like, options: getName.Options): Promise<getName.ReturnType> {
  return Action.promise("indexer.getName", Impl.getName, client, options);
}

export declare namespace getName {
  /** Options for {@link getName}. */
  type Options = Pick<Read.Options, "signal" | "strict"> &
    Omit<Query.GetName, "namespace"> & {
      /**
       * Namespace of the name.
       *
       * @default "basenames" for `*.base.eth`, otherwise "ens"
       */
      namespace?: Namespace | undefined;
    };
  /** The name, or `null` when the indexer does not know it. */
  type ReturnType = Result<IndexedNameDetail> | null;
  /** Errors {@link getName} can fail with. */
  type ErrorType =
    | Errors.CommonError
    | Errors.InvalidInputError
    | Errors.NotFoundError
    | Errors.IndexerError;
}

/** Builds a deferred read for `Actions.batch`. */
getName.request = Action.request(
  "indexer.getName",
  Impl.getName as Action.Declared<typeof Impl.getName, getName.ErrorType>,
);

/** Path of the action, e.g. for cache keys. */
getName.path = "indexer.getName" as const;
