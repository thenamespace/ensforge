import { Array as Arr, String as Str } from "effect";

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
 * import { Plan } from "@ensforge/sdk"
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

  if (!Arr.every(plans, (plan) => plan.chainId === first.chainId))
    throw new PlanError({ code: "PLAN_CHAIN_MISMATCH" });
  if (
    !Arr.every(
      plans,
      (plan) => Str.toLowerCase(plan.account ?? "") === Str.toLowerCase(first.account ?? ""),
    )
  ) {
    throw new PlanError({ code: "PLAN_ACCOUNT_MISMATCH" });
  }

  return make({
    operation: Arr.join(
      Arr.map(plans, (plan) => plan.operation),
      "+",
    ),
    chainId: first.chainId,
    account: first.account,
    steps: Arr.flatMap(plans, (plan, index) =>
      Arr.map(plan.steps, (step) => ({ ...step, id: `${index}.${step.id}` })),
    ),
    requirements: Arr.flatMap(plans, (plan) => plan.requirements),
    warnings: Arr.flatMap(plans, (plan) => plan.warnings),
    deploys: Arr.flatMap(plans, (plan) => plan.deploys),
  });
};
