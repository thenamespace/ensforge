import type { Like } from "../../../client/types.js";
import type { AnyError } from "../../../errors/types.js";
import * as Action from "../../../internal/action/index.js";
import type { Write } from "../../../Types.js";
import * as Impl from "./effect.js";

/**
 * Continues a saved plan after a failure or a reload. Resolves once the remaining transactions
 * are submitted.
 *
 * **When to use**
 *
 * Use when a registration, migration or other multi-step write stopped part-way. Use
 * {@link resumeSync} to wait for the receipts.
 *
 * **Details**
 *
 * - Steps submitted before are confirmed, not sent again; a dropped transaction or a failed
 *   bundle is sent again.
 * - Each remaining step is simulated against current state right before it is sent.
 * - The plan id is `result.plan.id`, or `context.planId` on a write's error.
 *
 * **Gotchas**
 *
 * - Plans live in the client's `storage`: pass `Plan.localStorage()` to survive page reloads.
 *
 * **Example** (Resuming after a failure)
 *
 * ```ts
 * const { hash } = await ens.plan.resume({ id: error.context.planId })
 * ```
 *
 * **Example** (Resuming with a standalone call)
 *
 * ```ts
 * import { Actions } from "@ensforge/core"
 *
 * await Actions.plan.resume(ens, { id })
 * ```
 *
 * **Example** (Resuming in an Effect program)
 *
 * ```ts
 * import { Actions } from "@ensforge/core/effect"
 *
 * yield* Actions.plan.resume(ens, { id })
 * ```
 *
 * @throws `Errors.NotFoundError` (`PLAN_NOT_FOUND`) or `Errors.PlanError` (`PLAN_CHAIN_MISMATCH`, `PLAN_ACCOUNT_MISMATCH`, `PLAN_ROUTE_REQUIRED`) when the plan cannot continue here.
 * @throws `Errors.ContractRevertError` (`CONTRACT_REVERTED`), or the failing step's own error, with `context.planId` and `context.step`.
 *
 * @see {@link Actions.plan.get} to read its progress first
 * @stability stable
 * @category writing
 * @since 1.0.0
 */
export function resume(
  client: Like,
  options: resume.Options & Write.Options,
): Promise<resume.ReturnType> {
  return Action.promise("plan.resume", Impl.resume, client, options);
}

export declare namespace resume {
  /** Options for {@link resume}. */
  type Options = {
    /** Plan id. */
    id: string;
  };
  /** Submitted transaction hashes (earlier steps included) and the plan. */
  type ReturnType = Write.Result;
  /** Errors {@link resume} can fail with. */
  type ErrorType = AnyError;
}

/**
 * Continues a saved plan and resolves once every receipt is in.
 *
 * **When to use**
 *
 * Use when the next step depends on the plan being finished on-chain.
 *
 * **Example** (Resuming and waiting)
 *
 * ```ts
 * const { receipts } = await ens.plan.resumeSync({ id })
 * ```
 *
 * **Example** (Waiting with a standalone call)
 *
 * ```ts
 * import { Actions } from "@ensforge/core"
 *
 * await Actions.plan.resumeSync(ens, { id })
 * ```
 *
 * **Example** (Waiting in an Effect program)
 *
 * ```ts
 * import { Actions } from "@ensforge/core/effect"
 *
 * yield* Actions.plan.resumeSync(ens, { id })
 * ```
 *
 * @throws `Errors.NotFoundError` (`PLAN_NOT_FOUND`) or `Errors.PlanError` (`PLAN_CHAIN_MISMATCH`, `PLAN_ACCOUNT_MISMATCH`, `PLAN_ROUTE_REQUIRED`) when the plan cannot continue here.
 * @throws `Errors.TransactionError` (`TRANSACTION_REVERTED`, `RECEIPT_TIMEOUT`) when confirmation fails.
 *
 * @see {@link resume} to resolve on submission
 * @stability stable
 * @category writing
 * @since 1.0.0
 */
export function resumeSync(
  client: Like,
  options: resumeSync.Options,
): Promise<resumeSync.ReturnType> {
  return Action.promise("plan.resumeSync", Impl.resumeSync, client, options);
}

export declare namespace resumeSync {
  /** Options for {@link resumeSync}. */
  type Options = resume.Options & Write.SyncOptions;
  /** Receipts plus the submitted hashes and plan. */
  type ReturnType = Write.SyncResult;
  /** Errors {@link resumeSync} can fail with. */
  type ErrorType = AnyError;
}
