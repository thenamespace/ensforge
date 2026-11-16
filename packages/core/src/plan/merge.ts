import { PlanError } from "../errors/classes/PlanError.js";
import { make } from "./make.js";
import type { Plan } from "./Plan.js";

/**
 * Combines plans into one, so they can be sent together, e.g. as one wallet batch.
 *
 * **Details**
 *
 * Steps keep their order; step ids are prefixed with the plan's position to stay unique.
 *
 * **Example** (Records and primary name in one batch)
 *
 * ```ts
 * import { Plan } from "@ensforge/core"
 *
 * const plan = Plan.merge([recordsPlan, primaryNamePlan])
 * ```
 *
 * @throws `Errors.PlanError` (`PLAN_CHAIN_MISMATCH`, `PLAN_ACCOUNT_MISMATCH`) when the plans were
 * prepared for different chains or accounts.
 * @category plans
 * @since 1.0.0
 */
export const merge = (plans: readonly [Plan, ...Plan[]]): Plan => {
  const [first] = plans;

  if (plans.some((plan) => plan.chainId !== first.chainId))
    throw new PlanError({ code: "PLAN_CHAIN_MISMATCH" });
  if (plans.some((plan) => plan.account?.toLowerCase() !== first.account?.toLowerCase())) {
    throw new PlanError({ code: "PLAN_ACCOUNT_MISMATCH" });
  }

  return make({
    operation: plans.map((plan) => plan.operation).join("+"),
    chainId: first.chainId,
    account: first.account,
    steps: plans.flatMap((plan, index) =>
      plan.steps.map((step) => ({ ...step, id: `${index}.${step.id}` })),
    ),
    requirements: plans.flatMap((plan) => plan.requirements),
    warnings: plans.flatMap((plan) => plan.warnings),
    deploys: plans.flatMap((plan) => plan.deploys),
  });
};
