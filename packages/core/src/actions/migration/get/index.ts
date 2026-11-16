import type { Like } from "../../../client/types.js";
import type { AnyError } from "../../../errors/types.js";
import * as Action from "../../../internal/action/index.js";
import type { Read } from "../../../Types.js";
import type { Status } from "../types.js";
import * as Impl from "./effect.js";

/**
 * Reads whether an ENSv1 name can migrate to ENSv2, how, and what it becomes.
 *
 * **When to use**
 *
 * Use to drive a migration screen: route, blockers, resolver plan and the state after.
 *
 * **Details**
 *
 * - `status`: `eligible`, `blocked` (see `blockers`), `migrated` or `not-required` (already
 *   on ENSv2, or not registered).
 * - `blockers` are checked for `account` (the client's account by default).
 * - `resolver.plan` shows what {@link Actions.migration.migrate} does with the current
 *   resolver for the same `resolver` option.
 * - Records and subnames are not discovered yet; pass them to `migrate`.
 *
 * **Example** (Checking a name)
 *
 * ```ts
 * const status = await ens.migration.get({ name: "alice.eth" })
 * ```
 *
 * **Example** (Checking a name with a standalone call)
 *
 * ```ts
 * import { Actions } from "@ensforge/core"
 *
 * const status = await Actions.migration.get(publicClient, { name: "alice.eth" })
 * ```
 *
 * **Example** (Checking a name in an Effect program)
 *
 * ```ts
 * import { Actions } from "@ensforge/core/effect"
 *
 * const status = yield* Actions.migration.get(ens, { name: "alice.eth" })
 * ```
 *
 * @throws `Errors.InvalidInputError` (`INVALID_NAME`, `INVALID_ADDRESS`) for invalid input.
 * @throws `Errors.NetworkError` when the RPC request fails.
 *
 * @see {@link Actions.migration.migrate} to migrate it
 * @stability stable
 * @category reading
 * @since 1.0.0
 */
export function get(client: Like, options: get.Options): Promise<get.ReturnType> {
  return Action.promise("migration.get", Impl.get, client, options);
}

export declare namespace get {
  /** Options for {@link get}. */
  type Options = Pick<Read.Options, "signal"> &
    Read.BlockOptions & {
      /** ENS name. Normalized automatically. */
      name: string;
      /** Account that would migrate. Defaults to the client's account. */
      account?: string | undefined;
      /** The `resolver` option `migrate` would get. */
      resolver?: "new" | "owned" | "keep" | (string & {}) | undefined;
    };
  /** Route, blockers, holder, resolver plan and the ENSv2 state after migrating. */
  type ReturnType = Status;
  /** Errors {@link get} can fail with. */
  type ErrorType = AnyError;
}

/** Builds a deferred read for `Actions.batch`. */
get.request = Action.request("migration.get", Impl.get);
