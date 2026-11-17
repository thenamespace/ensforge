import type { Hex } from "viem";

import type { Like } from "../../../client/types.js";
import type { AnyError } from "../../../errors/types.js";
import * as Action from "../../../internal/action/index.js";
import type { Plan } from "../../../plan/Plan.js";
import * as Impl from "./effect.js";

/**
 * Records a transaction sent outside ensforge as a plan step's submission.
 *
 * **When to use**
 *
 * Use when a step was sent from another device or the wallet lost track, so resuming does not send it again.
 *
 * **Details**
 *
 * - The transaction must exist and come from the plan's account, or call one of the step's
 *   contracts.
 * - {@link Actions.plan.resume} then waits for it instead of sending the step.
 *
 * **Example** (Attaching a recovered hash)
 *
 * ```ts
 * const record = await ens.plan.reconcile({ id, step: "commit", hash })
 * ```
 *
 * **Example** (Attaching a recovered hash with a standalone call)
 *
 * ```ts
 * import { Actions } from "@ensforge/sdk"
 *
 * const record = await Actions.plan.reconcile(publicClient, { id, step: "commit", hash })
 * ```
 *
 * **Example** (Attaching a recovered hash in an Effect program)
 *
 * ```ts
 * import { Actions } from "@ensforge/sdk/effect"
 *
 * const record = yield* Actions.plan.reconcile(ens, { id, step: "commit", hash })
 * ```
 *
 * @throws `Errors.NotFoundError` (`PLAN_NOT_FOUND`) for an unknown plan.
 * @throws `Errors.InvalidInputError` (`INVALID_RECORD_VALUE`) for an unknown step or an unrelated transaction.
 * @throws `Errors.NetworkError` when the RPC request fails.
 *
 * @see {@link Actions.plan.resume} to continue the plan
 * @stability stable
 * @category reading
 * @since 1.0.0
 */
export function reconcile(client: Like, options: reconcile.Options): Promise<reconcile.ReturnType> {
  return Action.promise("plan.reconcile", Impl.reconcile, client, options);
}

export declare namespace reconcile {
  /** Options for {@link reconcile}. */
  type Options = {
    /** Plan id. */
    id: string;
    /** Step id the transaction submitted. */
    step: string;
    /** Transaction hash. */
    hash: Hex;
  };
  /** The updated record. */
  type ReturnType = Plan.Record;
  /** Errors {@link reconcile} can fail with. */
  type ErrorType = AnyError;
}

/** Builds a deferred read for `Actions.batch`. */
reconcile.request = Action.request("plan.reconcile", Impl.reconcile);

/** Path of the action, e.g. for cache keys. */
reconcile.path = "plan.reconcile" as const;
