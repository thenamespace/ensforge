import { EnsforgeError, withDefaults } from "../EnsforgeError.js";

const defaults: {
  readonly [code in PlanError.Code]: (options: PlanError.Options) => EnsforgeError.Defaults;
} = {
  PLAN_STALE: () => ({
    shortMessage: "The plan no longer matches on-chain state.",
    hint: "Prepare the plan again.",
  }),
  PLAN_CHAIN_MISMATCH: () => ({ shortMessage: "The plan was prepared for another chain." }),
  PLAN_ACCOUNT_MISMATCH: () => ({ shortMessage: "The plan was prepared for another account." }),
  PLAN_INVALID: () => ({ shortMessage: "The text is not a serialized ensforge plan." }),
  PLAN_ROUTE_REQUIRED: () => ({
    shortMessage: "Part of this plan was sent through a route (`via`), which resuming needs again.",
    hint: "Pass the same `via` to plan.resume, e.g. `via: hca()`.",
  }),
};

/**
 * A prepared or saved plan can no longer be sent as-is.
 *
 * @stability stable
 * @category errors
 * @since 1.0.0
 */
export class PlanError extends EnsforgeError<"PlanError", PlanError.Code> {
  constructor(options: PlanError.Options) {
    super("PlanError", withDefaults(defaults[options.code](options), options));
  }
}

export declare namespace PlanError {
  type Code =
    | "PLAN_STALE"
    | "PLAN_CHAIN_MISMATCH"
    | "PLAN_ACCOUNT_MISMATCH"
    | "PLAN_INVALID"
    | "PLAN_ROUTE_REQUIRED";
  type Options = EnsforgeError.ClassOptions<Code>;
}
