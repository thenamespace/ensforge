import type { Like } from "../../../client/types.js";
import type * as Errors from "../../../errors/index.js";
import * as Action from "../../../internal/action/index.js";
import type { Plan } from "../../../plan/Plan.js";
import * as Impl from "./effect.js";

/**
 * Reads a saved plan and its progress.
 *
 * **When to use**
 *
 * Use to show where a registration, migration or other multi-step write stands.
 *
 * **Details**
 *
 * - Every write saves its plan to the client's `storage` as it sends.
 * - `null` when no plan has the id (memory storage forgets plans on reload).
 *
 * **Example** (Reading a plan)
 *
 * ```ts
 * const record = await ens.plan.get({ id: planId })
 * ```
 *
 * **Example** (Reading a plan with a standalone call)
 *
 * ```ts
 * import { Actions } from "@ensforge/sdk"
 *
 * const record = await Actions.plan.get(publicClient, { id: planId })
 * ```
 *
 * **Example** (Reading a plan in an Effect program)
 *
 * ```ts
 * import { Actions } from "@ensforge/sdk/effect"
 *
 * const record = yield* Actions.plan.get(ens, { id: planId })
 * ```
 *
 * @throws `Errors.InternalError` when the storage fails.
 * @throws `Errors.NetworkError` when the RPC request fails.
 *
 * @see {@link Actions.plan.resume} to continue it
 * @stability stable
 * @category reading
 * @since 1.0.0
 */
export function get(client: Like, options: get.Options): Promise<get.ReturnType> {
  return Action.promise("plan.get", Impl.get, client, options);
}

export declare namespace get {
  /** Options for {@link get}. */
  type Options = {
    /** Plan id, from `result.plan.id` or a failure's `context.planId`. */
    id: string;
  };
  /** The saved plan and its progress, or `null`. */
  type ReturnType = Plan.Record | null;
  /** Errors {@link get} can fail with. */
  type ErrorType = Errors.CommonError;
}

/** Builds a deferred read for `Actions.batch`. */
get.request = Action.request(
  "plan.get",
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- Action.Declared narrows errors to the documented @throws
  Impl.get as Action.Declared<typeof Impl.get, get.ErrorType>,
);

/** Path of the action, e.g. for cache keys. */
get.path = "plan.get" as const;
