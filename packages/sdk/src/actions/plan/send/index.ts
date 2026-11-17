import type { Like } from "../../../client/types.js";
import type { AnyError } from "../../../errors/types.js";
import * as Action from "../../../internal/action/index.js";
import type { Plan } from "../../../plan/Plan.js";
import type { Write } from "../../../Types.js";
import * as Impl from "./effect.js";

/**
 * Sends any plan: one prepared by a write's `.prepare`, or several combined with `Plan.merge`. Resolves once the transaction is submitted.
 *
 * **When to use**
 *
 * Use to review a plan before sending it, or to send several writes as one flow. Use {@link sendSync} to wait for the receipt.
 *
 * **Details**
 *
 * - The plan is simulated, then sent step by step; consecutive steps share one wallet bundle
 *   when the wallet supports atomic batches (`maxBundleCalls`), never across a chain-time wait.
 * - Progress is saved to the client's `storage`, so a failed or interrupted plan continues
 *   with {@link Actions.plan.resume}; failures carry `context.planId`.
 * - `onStep` reports each step as it waits, is submitted, confirmed or fails.
 *
 * **Example** (Sending a merged plan)
 *
 * ```ts
 * import { Plan } from "@ensforge/sdk"
 *
 * const { hash } = await ens.plan.send({ plan: Plan.merge([recordsPlan, primaryNamePlan]) })
 * ```
 *
 * **Example** (Sending a merged plan with a standalone call)
 *
 * ```ts
 * import { Actions, Plan } from "@ensforge/sdk"
 *
 * await Actions.plan.send(ens, { plan: Plan.merge([recordsPlan, primaryNamePlan]) })
 * ```
 *
 * **Example** (Sending a merged plan in an Effect program)
 *
 * ```ts
 * import { Actions, Plan } from "@ensforge/sdk/effect"
 *
 * yield* Actions.plan.send(ens, { plan: Plan.merge([recordsPlan, primaryNamePlan]) })
 * ```
 *
 * @throws `Errors.PlanError` (`PLAN_CHAIN_MISMATCH`, `PLAN_ACCOUNT_MISMATCH`) for a plan prepared elsewhere.
 * @throws `Errors.ContractRevertError` (`CONTRACT_REVERTED`), or the failing step's own error, with `context.planId` and `context.step`.
 * @throws `Errors.UserRejectedError` when the user rejects the request.
 *
 * @see {@link Actions.plan.resume} to continue a plan
 * @stability stable
 * @category writing
 * @since 1.0.0
 */
export function send(
  client: Like,
  options: send.Options & Write.Options,
): Promise<send.ReturnType> {
  return Action.promise("plan.send", Impl.send, client, options);
}

export declare namespace send {
  /** Options for {@link send}. */
  type Options = {
    /** The plan to send, for this client's chain and signer. */
    plan: Plan;
  };
  /** Submitted transaction hashes and the plan that produced them. */
  type ReturnType = Write.Result;
  /** Errors {@link send} can fail with. */
  type ErrorType = AnyError;
}

// Explicit types keep these declarations free of Effect types.

/** Builds the plan without sending anything. */
send.prepare = Action.promiseOf("plan.send.prepare", Impl.sendMethods.prepare) as Write.Method<
  send.Options,
  Plan
>;

/** Simulates the plan with `eth_call`, reporting each step. */
send.simulate = Action.promiseOf("plan.send.simulate", Impl.sendMethods.simulate) as Write.Method<
  send.Options,
  Plan.Simulation
>;

/** Estimates the gas and ETH the plan needs. */
send.estimateGas = Action.promiseOf(
  "plan.send.estimateGas",
  Impl.sendMethods.estimateGas,
) as Write.Method<send.Options, Plan.Estimate>;

/**
 * Sends any plan: one prepared by a write's `.prepare`, or several combined with `Plan.merge`. Resolves once the receipt is in.
 *
 * **When to use**
 *
 * Use when the next step depends on the change being on-chain.
 *
 * **Example** (Sending a merged plan and waiting)
 *
 * ```ts
 * import { Plan } from "@ensforge/sdk"
 *
 * const { receipt } = await ens.plan.sendSync({ plan: Plan.merge([recordsPlan, primaryNamePlan]) })
 * ```
 *
 * **Example** (Waiting with a standalone call)
 *
 * ```ts
 * import { Actions, Plan } from "@ensforge/sdk"
 *
 * await Actions.plan.sendSync(ens, { plan: Plan.merge([recordsPlan, primaryNamePlan]) })
 * ```
 *
 * **Example** (Waiting in an Effect program)
 *
 * ```ts
 * import { Actions, Plan } from "@ensforge/sdk/effect"
 *
 * yield* Actions.plan.sendSync(ens, { plan: Plan.merge([recordsPlan, primaryNamePlan]) })
 * ```
 *
 * @throws `Errors.PlanError` (`PLAN_CHAIN_MISMATCH`, `PLAN_ACCOUNT_MISMATCH`) for a plan prepared elsewhere.
 * @throws `Errors.ContractRevertError` (`CONTRACT_REVERTED`), or the failing step's own error, with `context.planId` and `context.step`.
 * @throws `Errors.TransactionError` (`TRANSACTION_REVERTED`, `RECEIPT_TIMEOUT`) when confirmation fails.
 *
 * @see {@link send} to resolve on submission
 * @stability stable
 * @category writing
 * @since 1.0.0
 */
export function sendSync(client: Like, options: sendSync.Options): Promise<sendSync.ReturnType> {
  return Action.promise("plan.sendSync", Impl.sendSync, client, options);
}

export declare namespace sendSync {
  /** Options for {@link sendSync}. */
  type Options = send.Options & Write.SyncOptions;
  /** Receipts plus the submitted hashes and plan. */
  type ReturnType = Write.SyncResult;
  /** Errors {@link sendSync} can fail with. */
  type ErrorType = AnyError;
}
