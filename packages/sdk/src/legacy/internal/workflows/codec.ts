import { Predicate } from "effect";

import { WorkflowError } from "../../errors/workflow-error.js";

// Tag every container so application records cannot collide with bigint markers.
const encode = (input: unknown): unknown => {
  if (input === undefined) return ["undefined"];
  if (typeof input === "bigint") return ["bigint", input.toString()];
  if (input === null || typeof input === "string" || typeof input === "boolean") return input;
  if (typeof input === "number" && Number.isFinite(input)) return input;
  if (Array.isArray(input)) return ["array", input.map(encode)];
  if (Predicate.isError(input)) return ["error", input.name, "Workflow step failed"];
  if (Predicate.isObject(input) && Object.getPrototypeOf(input) === Object.prototype)
    return [
      "object",
      Object.keys(input)
        // ES2022 target; Object.keys creates a fresh array.
        // oxlint-disable-next-line unicorn/no-array-sort
        .sort()
        .map((key) => [key, encode(input[key])]),
    ];

  throw new WorkflowError({
    code: "INVALID_STATE",
    message: "Workflow state must contain serializable values, not runtime clients or credentials",
  });
};

export const encodeWorkflowValue = (value: unknown): string => JSON.stringify(encode(value));

const decode = (input: unknown): unknown => {
  if (
    input === null ||
    typeof input === "string" ||
    typeof input === "boolean" ||
    (typeof input === "number" && Number.isFinite(input))
  )
    return input;
  if (Array.isArray(input)) {
    const [tag, value] = input;
    if (tag === "undefined" && input.length === 1) return undefined;
    if (tag === "bigint" && typeof value === "string" && /^-?(0|[1-9]\d*)$/.test(value))
      return BigInt(value);
    if (tag === "error" && typeof value === "string" && typeof input[2] === "string")
      return new Error(input[2]);
    if (tag === "array" && Array.isArray(value)) return value.map(decode);
    if (tag === "object" && Array.isArray(value)) {
      const entries = value.map((entry: unknown) => {
        if (!Array.isArray(entry) || entry.length !== 2 || typeof entry[0] !== "string")
          throw new Error("Invalid entry");
        return [entry[0], decode(entry[1])] as const;
      });
      if (new Set(entries.map(([key]) => key)).size !== entries.length)
        throw new Error("Duplicate key");
      return Object.fromEntries(entries);
    }
  }
  throw new Error("Invalid workflow value");
};

export const decodeWorkflowValue = (text: string): unknown => {
  try {
    return decode(JSON.parse(text));
  } catch (cause) {
    throw new WorkflowError({
      code: "INVALID_STATE",
      message: "Stored workflow data is invalid",
      cause,
    });
  }
};
