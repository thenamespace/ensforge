import { Array as Arr } from "effect";

/* oxlint-disable effecttsgo/global-json, typescript/no-unsafe-type-assertion -- plans carry bigints, so JSON needs a replacer and reviver, which Schema JSON codecs do not take; the parsed shape is checked by `deserialize` */
import { PlanError } from "../errors/classes/PlanError.js";
import type { Plan } from "./Plan.js";

// JSON has no bigint; encode them as tagged objects so they round-trip exactly.
const bigintTag = "~bigint";

const replacer = (_key: string, value: unknown): unknown =>
  typeof value === "bigint" ? { [bigintTag]: value.toString() } : value;

const reviver = (_key: string, value: unknown): unknown => {
  if (typeof value !== "object" || value === null) return value;

  const encoded = (value as { readonly [bigintTag]?: unknown })[bigintTag];
  return typeof encoded === "string" ? BigInt(encoded) : value;
};

/**
 * JSON text for a plan or saved plan record, with bigints preserved.
 *
 * @category plans
 * @since 1.0.0
 */
export const serialize = (value: Plan | Plan.Record): string => JSON.stringify(value, replacer);

/**
 * Reads a plan back from {@link serialize} output.
 *
 * @throws `Errors.PlanError` (`PLAN_INVALID`) when the text is not a serialized plan.
 * @category plans
 * @since 1.0.0
 */
export const deserialize = (text: string): Plan => {
  try {
    const plan = JSON.parse(text, reviver) as Partial<Plan>;
    if (typeof plan.id !== "string" || !Arr.isArray(plan.steps))
      throw new Error("missing id or steps");
    return plan as Plan;
  } catch (cause) {
    throw new PlanError({ code: "PLAN_INVALID", cause });
  }
};

/** @internal */
export const deserializeRecord = (text: string): Plan.Record =>
  JSON.parse(text, reviver) as Plan.Record;
