import { Array as Arr, Predicate } from "effect";

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

const isPlan = (value: unknown): value is Plan =>
  Predicate.isObject(value) && Predicate.isString(value["id"]) && Arr.isArray(value["steps"]);

const isRecord = (value: unknown): value is Plan.Record =>
  Predicate.isObject(value) &&
  isPlan(value["plan"]) &&
  Predicate.isString(value["status"]) &&
  Predicate.isObject(value["submitted"]) &&
  Predicate.isNumber(value["updatedAt"]);

const parse = <value>(text: string, isValid: (value: unknown) => value is value): value => {
  try {
    const value: unknown = JSON.parse(text, reviver);
    if (!isValid(value)) throw new Error("the text is not a serialized plan or plan record");
    return value;
  } catch (cause) {
    throw new PlanError({ code: "PLAN_INVALID", cause });
  }
};

/**
 * Reads a plan back from {@link serialize} output.
 *
 * @throws `Errors.PlanError` (`PLAN_INVALID`) when the text is not a serialized plan.
 * @category plans
 * @since 1.0.0
 */
export const deserialize = (text: string): Plan => parse(text, isPlan);

/**
 * Reads a saved plan record back from {@link serialize} output, with its bigints restored.
 *
 * **When to use**
 *
 * Use in a custom `Plan.Storage` that keeps records as text, such as a database or a server
 * endpoint, to turn what it stored back into the record `plan.resume` continues from.
 *
 * **Example** (Reading a record from a server)
 *
 * ```ts
 * import { Plan } from "@ensforge/sdk"
 *
 * const response = await fetch(`/api/plans/${planId}`)
 * const record = Plan.deserializeRecord(await response.text())
 * record.status // "pending" | "completed" | "failed"
 * ```
 *
 * @throws `Errors.PlanError` (`PLAN_INVALID`) when the text is not a serialized plan record.
 * @stability stable
 * @category plans
 * @since 1.0.1
 */
export const deserializeRecord = (text: string): Plan.Record => parse(text, isRecord);
