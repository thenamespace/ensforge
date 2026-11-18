import type { Like } from "../../../client/types.js";
import type { AnyError } from "../../../errors/types.js";
import * as Action from "../../../internal/action/index.js";
import type { Plan } from "../../../plan/Plan.js";
import * as Impl from "./effect.js";

/**
 * Lists the saved plans of this client's chain and of its `chains`, newest first.
 *
 * **When to use**
 *
 * Use to offer unfinished registrations or migrations after a reload.
 *
 * **Details**
 *
 * - Filter by the account that prepared them and by status (`pending`, `completed`,
 *   `failed`).
 *
 * **Example** (Listing unfinished plans)
 *
 * ```ts
 * const records = await ens.plan.list({ status: "failed" })
 * ```
 *
 * **Example** (Listing unfinished plans with a standalone call)
 *
 * ```ts
 * import { Actions } from "@ensforge/sdk"
 *
 * const records = await Actions.plan.list(publicClient, { status: "failed" })
 * ```
 *
 * **Example** (Listing unfinished plans in an Effect program)
 *
 * ```ts
 * import { Actions } from "@ensforge/sdk/effect"
 *
 * const records = yield* Actions.plan.list(ens, { status: "failed" })
 * ```
 *
 * @throws `Errors.InvalidInputError` (`INVALID_ADDRESS`) for an invalid account.
 * @throws `Errors.NetworkError` when the RPC request fails.
 *
 * @see {@link Actions.plan.get} to read one
 * @stability stable
 * @category reading
 * @since 1.0.0
 */
export function list(client: Like, options: list.Options): Promise<list.ReturnType> {
  return Action.promise("plan.list", Impl.list, client, options);
}

export declare namespace list {
  /** Options for {@link list}. */
  type Options = {
    /** Only plans prepared for this account. */
    account?: string | undefined;
    /** Only plans with this status. */
    status?: Plan.Record["status"] | undefined;
  };
  /** The saved plans, newest first. */
  type ReturnType = readonly Plan.Record[];
  /** Errors {@link list} can fail with. */
  type ErrorType = AnyError;
}

/** Builds a deferred read for `Actions.batch`. */
list.request = Action.request("plan.list", Impl.list);

/** Path of the action, e.g. for cache keys. */
list.path = "plan.list" as const;
